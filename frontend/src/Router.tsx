import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import EntryPage from './pages/EntryPage';
import App from './App';

/**
 * 部署到 GitHub Pages 子路径（如 /CC-PinDou/）时，Vite 的 BASE_URL 会带上该前缀。
 * BrowserRouter 必须使用相同的 basename，否则 pathname 会被当成根路径而匹配不到任何路由。
 * 根路径部署时 BASE_URL 为 '/'，basename 退化为根，与改动前行为一致。
 */
function routerBasename(): string {
  const base = import.meta.env.BASE_URL || '/';
  const stripped = base.replace(/\/+$/, '');
  return stripped === '' ? '/' : stripped;
}

export function Router() {
  return (
    <BrowserRouter basename={routerBasename()}>
      <Routes>
        <Route path="/" element={<EntryPage />} />
        <Route path="/:mode" element={<App />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
