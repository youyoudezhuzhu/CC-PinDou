#!/usr/bin/env python3
"""把 MARD 权威色卡应用到项目内的各份颜色数据。

背景
----
项目里 MARD 色值原本只有 43% 与 MARD 官方色卡一致（色号本身 100% 对得上）。
本脚本以 data/mard-chart/mard-2026-rev.json 为唯一数据源，
统一写入下面三处，避免多处手工维护产生分叉：

  1. frontend/src/data/colorSystemMapping.json   （前端）
  2. data/colorSystemMapping.json                （后端，server/config.py 读取）
  3. data/colors.db                              （SQLite，brand='MARD'）

数据来源
--------
https://www.pixel-beads.com/zh/mard-bead-color-chart
「MARD 拼豆色号大全 (2026重新修订版)」，CC BY 4.0，creator: PixelBeads。

只改 MARD 的色值，其余品牌（COCO / 漫漫 / 盼盼 / 咪小窝）与色号一律不动。

用法
----
    python3 scripts/sync-mard-colors.py --check   # 只检查不写入
    python3 scripts/sync-mard-colors.py           # 写入
"""

import argparse
import json
import re
import sqlite3
import sys
from pathlib import Path

# 已知例外：权威色卡里 Q04 与 R11 是同一个色值 #FFEBFA，
# 但本项目的数据结构以 hex 为 key（hex -> 各品牌色号），同一个 hex 无法承载
# 两个 MARD 色号，直接同步会把 291 色并成 290 色、丢掉一个颜色。
# 本地 Q04 已等于权威值，因此保留 R11 现有的独立值 #FFEBFB（相差 1），
# 既不丢色也不编造数据。若将来数据结构改成以「品牌+色号」为 key，可移除本例外。
EXCEPTIONS = {
    'R11': '#FFEBFB',
}

ROOT = Path(__file__).resolve().parent.parent
CHART = ROOT / 'data' / 'mard-chart' / 'mard-2026-rev.json'
JSONS = [
    ROOT / 'frontend' / 'src' / 'data' / 'colorSystemMapping.json',
    ROOT / 'data' / 'colorSystemMapping.json',
]
DB = ROOT / 'data' / 'colors.db'


def norm_code(code: str) -> str:
    """A1 / a01 -> A01，用于容忍补零写法差异（站点写 ZG1，本地写 ZG01）。"""
    m = re.match(r'^([A-Za-z]+)0*(\d+)$', str(code).strip())
    return f'{m.group(1).upper()}{int(m.group(2)):02d}' if m else str(code).upper()


def load_chart() -> dict:
    data = json.loads(CHART.read_text(encoding='utf-8'))
    return {norm_code(k): v.upper() for k, v in data['colors'].items()}


def target_hex(codes: dict, chart: dict) -> str | None:
    """某条目同步后应使用的 hex；无 MARD 或无权威值则返回 None。"""
    mard = codes.get('MARD')
    if not mard:
        return None
    code = norm_code(mard)
    if code in EXCEPTIONS:
        return EXCEPTIONS[code]
    return chart.get(code)


def sync_json(path: Path, chart: dict, write: bool) -> int:
    mapping = json.loads(path.read_text(encoding='utf-8'))
    changed = 0
    rebuilt: dict = {}
    collisions: list = []
    for hex_key, codes in mapping.items():
        want = target_hex(codes, chart)
        if want and want != hex_key.upper():
            changed += 1
        key = want or hex_key.upper()
        if key in rebuilt:
            collisions.append((key, rebuilt[key].get('MARD'), codes.get('MARD')))
            key = hex_key.upper()   # 冲突时保留原 key，绝不丢条目
        rebuilt[key] = codes
    if collisions:
        raise SystemExit(f'  ✗ {path.name} 出现未处理的 hex 冲突: {collisions}')
    if write:
        path.write_text(
            json.dumps(dict(sorted(rebuilt.items())), ensure_ascii=False, indent=2) + '\n',
            encoding='utf-8',
        )
    return changed


def plan_db(path: Path, chart: dict):
    """算出 DB 里需要改的行，并检测「逐个 UPDATE 会撞主键」的情况。

    colors 表主键是 (hex, brand)。像 H02 -> #FFFFFF 这种更新，
    可能暂时撞上另一个 MARD 行（例如 T01 当前正是 #FFFFFF，
    但它同一轮会改成 #E2DFD7）——整体结果不冲突，逐条执行却会失败。
    """
    conn = sqlite3.connect(path)
    try:
        rows = list(conn.execute("SELECT rowid, hex, code FROM colors WHERE brand='MARD'"))
        plan = []
        for rowid, hex_key, code in rows:
            code_n = norm_code(code)
            want = EXCEPTIONS.get(code_n) or chart.get(code_n)
            if want and want.upper() != hex_key.upper():
                plan.append((rowid, hex_key.upper(), want.upper(), code))
        occupied = {}
        for rowid, hex_key, _ in rows:
            occupied.setdefault(hex_key.upper(), set()).add(rowid)
        # 目标值当前被别人占着 -> 需要先挪走，两阶段写入
        needs_temp = [
            (rowid, old, new, code)
            for rowid, old, new, code in plan
            if occupied.get(new, set()) - {rowid}
        ]
        return plan, needs_temp
    finally:
        conn.close()


def sync_db(path: Path, chart: dict, write: bool) -> int:
    plan, needs_temp = plan_db(path, chart)
    if not write:
        return len(plan)
    conn = sqlite3.connect(path)
    try:
        # 阶段 1：把所有要改的行统统挪到临时值。
        # 不能只挪「会撞」的那些 —— 落位顺序仍有讲究（H02 要占用的 #FFFFFF
        # 得等 T01 先腾出来），全部挪走就与顺序无关了。
        for rowid, _old, _new, _code in plan:
            conn.execute('UPDATE colors SET hex=? WHERE rowid=?', (f'__tmp__{rowid}', rowid))
        # 阶段 2：写入最终值
        for rowid, _old, new, _code in plan:
            conn.execute('UPDATE colors SET hex=? WHERE rowid=?', (new, rowid))
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return len(plan)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true', help='只报告差异，不写入')
    args = ap.parse_args()
    write = not args.check

    chart = load_chart()
    print(f'权威色卡: {len(chart)} 色  ({CHART.relative_to(ROOT)})')
    print(f'模式: {"写入" if write else "仅检查"}\n')

    # 先全部预检（含 DB 主键冲突检测），任何一处有问题都不动手
    json_counts = []
    for path in JSONS:
        json_counts.append((path, sync_json(path, chart, write=False)))
    plan, needs_temp = plan_db(DB, chart)
    if needs_temp:
        codes = ', '.join(f'{c}({o}->{n})' for _, o, n, c in needs_temp)
        print(f'  提示: DB 主键需两阶段写入（先挪开再落位）: {codes}\n')

    total = 0
    for path, n in json_counts:
        written = sync_json(path, chart, write=write)
        total += written
        print(f'  {path.relative_to(ROOT)}: {n} 条不同')
    n = sync_db(DB, chart, write=write)
    total += n
    print(f'  {DB.relative_to(ROOT)}: {n} 条不同')
    print(f'\n合计需更新 {total} 处' + ('' if write else '（未写入）'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
