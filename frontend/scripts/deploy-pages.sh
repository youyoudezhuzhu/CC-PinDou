#!/bin/bash
# 把前端构建产物发布到 GitHub Pages（gh-pages 分支）。
#
# 用法：
#   scripts/deploy-pages.sh                            # 发布到 origin，base 自动取 <仓库名>
#   scripts/deploy-pages.sh --base /CC-PinDou/         # 显式指定子路径
#   scripts/deploy-pages.sh --cname pindou.yiling.win  # 绑定自定义域名（base 自动改为 /）
#   scripts/deploy-pages.sh --remote upstream          # 指定远端
#   scripts/deploy-pages.sh --dry-run                  # 只构建，不推送
#
# 关于自定义域名：
#   绑定域名后站点从 https://<user>.github.io/<repo>/ 变为 https://<域名>/，
#   也就是从「子路径」变成「域名根目录」，因此 base 必须由 /<repo>/ 改为 /。
#   本脚本在传入 --cname 时会自动处理，并写入 GitHub Pages 需要的 CNAME 文件。
#
# 认证：
#   优先使用已配置的 git 凭据；若提供 $GH_TOKEN 或 --token-file，
#   则通过 GIT_ASKPASS 临时注入，令牌不会出现在命令行参数或 .git/config 中。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_DIR="$(cd "$FRONTEND_DIR/.." && pwd)"

REMOTE="origin"
BASE=""
CNAME=""
DRY_RUN=0
TOKEN_FILE=""
BRANCH="gh-pages"

while [ $# -gt 0 ]; do
    case "$1" in
        --remote)     REMOTE="$2"; shift 2 ;;
        --base)       BASE="$2"; shift 2 ;;
        --cname)      CNAME="$2"; shift 2 ;;
        --branch)     BRANCH="$2"; shift 2 ;;
        --token-file) TOKEN_FILE="$2"; shift 2 ;;
        --dry-run)    DRY_RUN=1; shift ;;
        -h|--help)    sed -n '2,24p' "$0"; exit 0 ;;
        *) echo "未知参数: $1" >&2; exit 2 ;;
    esac
done

cd "$REPO_DIR"

# ---------------------------------------------------------------- 计算 base
REMOTE_URL="$(git remote get-url "$REMOTE")"
if [ -n "$CNAME" ]; then
    # 自定义域名：站点位于域名根目录
    if [ -n "$BASE" ] && [ "$BASE" != "/" ]; then
        echo "==> 警告：--cname 与 --base $BASE 同时指定，自定义域名下站点在根目录，已强制 base=/" >&2
    fi
    BASE="/"
    echo "==> 自定义域名: $CNAME（base 强制为 /）"
elif [ -z "$BASE" ]; then
    # 从远端 URL 推断仓库名，GitHub Pages 项目站点部署在 /<仓库名>/ 下
    REPO_NAME="$(basename "$REMOTE_URL" .git)"
    BASE="/$REPO_NAME/"
    echo "==> 未指定 --base，按仓库名推断: $BASE"
fi
# 规范化：确保前后都有 '/'
case "$BASE" in /*) ;; *) BASE="/$BASE" ;; esac
case "$BASE" in */) ;; *) BASE="$BASE/" ;; esac

echo "==> 远端: $REMOTE ($REMOTE_URL)"
echo "==> base: $BASE"

# ---------------------------------------------------------------- 构建
echo "==> 构建前端"
cd "$FRONTEND_DIR"
VITE_BASE="$BASE" npm run build

DIST="$FRONTEND_DIR/dist"
[ -f "$DIST/index.html" ] || { echo "构建产物缺少 index.html" >&2; exit 1; }

# ---------------------------------------------------------------- 静态站点修补
# .nojekyll：禁止 GitHub Pages 用 Jekyll 处理产物（否则 _ 开头的文件会被忽略）
touch "$DIST/.nojekyll"

# 404.html：GitHub Pages 对未知路径返回 404.html。
# 复制 index.html 作为 SPA 回退，刷新 /draw 这类深链才不会 404。
cp "$DIST/index.html" "$DIST/404.html"

# CNAME：自定义域名必需。缺少它 GitHub Pages 会在下次构建时清空自定义域名设置。
if [ -n "$CNAME" ]; then
    printf '%s\n' "$CNAME" > "$DIST/CNAME"
    echo "==> 已写入 CNAME: $CNAME"
fi

echo "==> 产物检查"
CHECK_FILES="index.html 404.html .nojekyll fonts/NOTICE.txt fonts/pixel-8-fusion-mono.bin fonts/pixel-16-unifont.bin"
[ -n "$CNAME" ] && CHECK_FILES="$CHECK_FILES CNAME"
for f in $CHECK_FILES; do
    if [ -e "$DIST/$f" ]; then
        echo "    ✓ $f"
    else
        echo "    ✗ 缺少 $f" >&2
        exit 1
    fi
done

if [ "$CNAME" != "" ] && [ "$(cat "$DIST/CNAME")" != "$CNAME" ]; then
    echo "    ✗ CNAME 内容不正确" >&2
    exit 1
fi

if [ "$DRY_RUN" -eq 1 ]; then
    echo "==> [dry-run] 构建完成，未推送。产物目录: $DIST"
    exit 0
fi

# ---------------------------------------------------------------- 令牌装载
TOKEN_TMP=""; ASKPASS_TMP=""
cleanup() { [ -n "$TOKEN_TMP" ] && rm -f "$TOKEN_TMP"; [ -n "$ASKPASS_TMP" ] && rm -f "$ASKPASS_TMP"; }
trap cleanup EXIT INT TERM

if [ -z "${GH_TOKEN:-}" ] && [ -n "$TOKEN_FILE" ] && [ -r "$TOKEN_FILE" ]; then
    GH_TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
fi

if [ -n "${GH_TOKEN:-}" ]; then
    TOKEN_TMP="$(mktemp)"; ASKPASS_TMP="$(mktemp)"
    chmod 600 "$TOKEN_TMP"; printf '%s' "$GH_TOKEN" > "$TOKEN_TMP"
    chmod 700 "$ASKPASS_TMP"
    cat > "$ASKPASS_TMP" <<'EOF'
#!/bin/sh
case "$1" in
    *Username*) printf '%s' "x-access-token" ;;
    *Password*) cat "$GH_TOKEN_TMP" ;;
    *)          printf '%s' "" ;;
esac
EOF
    export GH_TOKEN_TMP="$TOKEN_TMP" GIT_ASKPASS="$ASKPASS_TMP"
fi

# ---------------------------------------------------------------- 发布
# 用独立的临时仓库提交产物，避免污染 feature 分支的工作区与历史
WORK="$(mktemp -d)"
trap 'cleanup; rm -rf "$WORK"' EXIT INT TERM

echo "==> 准备 gh-pages 产物"
cp -r "$DIST/." "$WORK/"
cd "$WORK"
git init -q
git config user.name "$(git -C "$REPO_DIR" config user.name || echo deploy)"
git config user.email "$(git -C "$REPO_DIR" config user.email || echo deploy@local)"
git add -A
COMMIT_MSG="deploy: $(git -C "$REPO_DIR" rev-parse --short HEAD) $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git commit -q -m "$COMMIT_MSG"

echo "==> 推送到 $REMOTE/$BRANCH"
git remote add target "$REMOTE_URL"
git push --force target "HEAD:$BRANCH"

echo
echo "✅ 已发布。若首次部署，请在仓库 Settings → Pages 选择 $BRANCH 分支作为来源。"
echo "   预计地址: https://<owner>.github.io${BASE}"
