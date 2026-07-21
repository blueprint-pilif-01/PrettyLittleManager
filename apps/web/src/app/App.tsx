import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedLayout } from "../auth/protected-layout";
import { AppShell } from "../components/app-shell";

const AcceptInvitationPage = lazy(() => import("../pages/accept-invitation-page").then((module) => ({ default: module.AcceptInvitationPage })));
const AuditPage = lazy(() => import("../pages/admin-pages").then((module) => ({ default: module.AuditPage })));
const CategoriesPage = lazy(() => import("../pages/admin-pages").then((module) => ({ default: module.CategoriesPage })));
const SettingsPage = lazy(() => import("../pages/settings-page").then((module) => ({ default: module.SettingsPage })));
const UsersPage = lazy(() => import("../pages/admin-pages").then((module) => ({ default: module.UsersPage })));
const WarehousesPage = lazy(() => import("../pages/admin-pages").then((module) => ({ default: module.WarehousesPage })));
const AttributesPage = lazy(() => import("../pages/catalog-ops-pages").then((module) => ({ default: module.AttributesPage })));
const ExportsPage = lazy(() => import("../pages/catalog-ops-pages").then((module) => ({ default: module.ExportsPage })));
const FamiliesPage = lazy(() => import("../pages/catalog-ops-pages").then((module) => ({ default: module.FamiliesPage })));
const Gs1Page = lazy(() => import("../pages/catalog-ops-pages").then((module) => ({ default: module.Gs1Page })));
const ImportsPage = lazy(() => import("../pages/catalog-ops-pages").then((module) => ({ default: module.ImportsPage })));
const SynchronizationPage = lazy(() => import("../pages/catalog-ops-pages").then((module) => ({ default: module.SynchronizationPage })));
const DashboardPage = lazy(() => import("../pages/dashboard-page").then((module) => ({ default: module.DashboardPage })));
const EmagPage = lazy(() => import("../pages/emag-page").then((module) => ({ default: module.EmagPage })));
const InventoryPage = lazy(() => import("../pages/inventory-page").then((module) => ({ default: module.InventoryPage })));
const LoginPage = lazy(() => import("../pages/login-page").then((module) => ({ default: module.LoginPage })));
const ProductDetailPage = lazy(() => import("../pages/product-detail-page").then((module) => ({ default: module.ProductDetailPage })));
const NewProductPage = lazy(() => import("../pages/new-product-page").then((module) => ({ default: module.NewProductPage })));
const NotificationsPage = lazy(() => import("../pages/notifications-page").then((module) => ({ default: module.NotificationsPage })));
const ProductsPage = lazy(() => import("../pages/products-page").then((module) => ({ default: module.ProductsPage })));
const SetupPage = lazy(() => import("../pages/setup-page").then((module) => ({ default: module.SetupPage })));
const WebsitesPage = lazy(() => import("../pages/websites-page").then((module) => ({ default: module.WebsitesPage })));

export function App() {
  return (
    <Suspense fallback={<div className="loading-line" role="progressbar" aria-label="Loading page" />}>
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route path="setup" element={<SetupPage />} />
      <Route path="accept-invitation" element={<AcceptInvitationPage />} />
      <Route element={<ProtectedLayout />}>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route path="products/new" element={<NewProductPage />} />
          <Route path="products/:id" element={<ProductDetailPage />} />
          <Route path="families" element={<FamiliesPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="attributes" element={<AttributesPage />} />
          <Route path="inventory" element={<InventoryPage />} />
          <Route path="warehouses" element={<WarehousesPage />} />
          <Route path="imports" element={<ImportsPage />} />
          <Route path="exports" element={<ExportsPage />} />
          <Route path="channels/websites" element={<WebsitesPage />} />
          <Route path="channels/emag" element={<EmagPage />} />
          <Route path="synchronization" element={<SynchronizationPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="gs1" element={<Gs1Page />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="audit" element={<AuditPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate replace to="/" />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  );
}
