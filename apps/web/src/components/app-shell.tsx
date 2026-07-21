import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowsClockwise,
  Barcode,
  Bell,
  CaretDown,
  CirclesThreePlus,
  DownloadSimple,
  FileCsv,
  Gear,
  Globe,
  List,
  ListMagnifyingGlass,
  LockKey,
  MagnifyingGlass,
  MapPin,
  Moon,
  Package,
  Shapes,
  SlidersHorizontal,
  SquaresFour,
  Stack,
  Storefront,
  Sun,
  TreeStructure,
  UploadSimple,
  UsersThree,
  Warehouse,
  X,
  type Icon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { useAuth } from "../auth/auth-context";

type NavItem = { label: string; to: string; icon: Icon };
type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  { label: "Overview", items: [{ label: "Dashboard", to: "/", icon: SquaresFour }] },
  {
    label: "Catalog",
    items: [
      { label: "Products", to: "/products", icon: Package },
      { label: "Product families", to: "/families", icon: Stack },
      { label: "Categories", to: "/categories", icon: TreeStructure },
      { label: "Attributes", to: "/attributes", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Operations",
    items: [
      { label: "Inventory", to: "/inventory", icon: Warehouse },
      { label: "Warehouses", to: "/warehouses", icon: MapPin },
      { label: "Imports", to: "/imports", icon: UploadSimple },
      { label: "Exports", to: "/exports", icon: DownloadSimple },
    ],
  },
  {
    label: "Channels",
    items: [
      { label: "eMAG", to: "/channels/emag", icon: Storefront },
      { label: "Websites", to: "/channels/websites", icon: Globe },
      { label: "Synchronization", to: "/synchronization", icon: ArrowsClockwise },
    ],
  },
  {
    label: "Governance",
    items: [
      { label: "GS1 & barcodes", to: "/gs1", icon: Barcode },
      { label: "Users", to: "/users", icon: UsersThree },
      { label: "Audit log", to: "/audit", icon: ListMagnifyingGlass },
      { label: "Settings", to: "/settings", icon: Gear },
    ],
  },
];

const pageNames: Record<string, string> = {
  ...Object.fromEntries(navGroups.flatMap((group) => group.items.map((item) => [item.to, item.label]))),
  "/notifications": "Notifications",
};

function SidebarContent({ closeMobile }: { closeMobile?: () => void }) {
  const { profile } = useAuth();
  const workspaceName = profile?.company.name ?? "Pretty Little Things";
  return (
    <>
      <div className="brand-block">
        <span className="brand-mark" aria-hidden="true"><Shapes size={19} weight="fill" /></span>
        <span><strong>PrettyLittle</strong><small>Manager</small></span>
      </div>
      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map((item) => {
              const IconComponent = item.icon;
              return (
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  key={item.to}
                  onClick={closeMobile}
                  className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
                >
                  <IconComponent size={17} weight="duotone" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="workspace-lock">
        <LockKey size={15} weight="duotone" aria-hidden="true" />
        <span><strong>{workspaceName}</strong><small>Private · invitation only</small></span>
      </div>
    </>
  );
}

export function AppShell() {
  const { profile, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(() => localStorage.getItem("plm-theme") === "dark");
  const title = location.pathname === "/products/new" ? "New product" : location.pathname.startsWith("/products/") ? "Product details" : pageNames[location.pathname] ?? "PrettyLittleManager";
  const searchItems = navGroups.flatMap((group) => group.items).filter((item) => item.label.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("plm-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    const openSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", openSearch);
    return () => window.removeEventListener("keydown", openSearch);
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="desktop-sidebar"><SidebarContent /></aside>

      <div className="app-main">
        <header className="topbar">
          <div className="topbar-leading">
            <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
              <Dialog.Trigger asChild>
                <Button className="mobile-menu-button" variant="ghost" size="icon" aria-label="Open navigation">
                  <List size={20} />
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="mobile-nav-overlay" />
                <Dialog.Content className="mobile-nav-content" aria-label="Navigation menu">
                  <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                  <Dialog.Close asChild>
                    <Button className="mobile-nav-close" variant="ghost" size="icon" aria-label="Close navigation"><X size={19} /></Button>
                  </Dialog.Close>
                  <SidebarContent closeMobile={() => setMobileOpen(false)} />
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            <div className="breadcrumb"><span>{profile?.company.name ?? "Pretty Little Things"}</span><span>/</span><strong>{title}</strong></div>
          </div>

          <div className="topbar-actions">
            <Dialog.Root open={searchOpen} onOpenChange={setSearchOpen}><Dialog.Trigger asChild><button className="global-search" type="button" aria-label="Search workspace"><MagnifyingGlass size={15} aria-hidden="true" /><span>Search workspace</span><kbd>⌘ K</kbd></button></Dialog.Trigger><Dialog.Portal><Dialog.Overlay className="sheet-overlay command-overlay" /><Dialog.Content className="command-dialog"><Dialog.Title>Search workspace</Dialog.Title><div className="search-control command-search"><MagnifyingGlass size={16} /><input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a page…" /></div><div className="command-results">{searchItems.map((item) => { const IconComponent = item.icon; return <button type="button" key={item.to} onClick={() => { navigate(item.to); setSearchOpen(false); setSearch(""); }}><IconComponent size={17} /><span>{item.label}</span></button>; })}</div><Dialog.Close asChild><Button className="command-close" variant="ghost" size="icon" aria-label="Close search"><X size={17} /></Button></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>
            <Button variant="ghost" size="icon" aria-label={dark ? "Use light theme" : "Use dark theme"} onClick={() => setDark((value) => !value)}>
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
            <Button asChild variant="ghost" size="icon" aria-label="Notifications"><Link to="/notifications"><Bell size={18} /></Link></Button>
            <Link className="user-menu" to="/settings" aria-label="Open account settings">
              <span className="avatar">{profile?.displayName.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
              <span className="user-copy"><strong>{profile?.displayName}</strong><small>{profile?.role.name}</small></span>
              <CaretDown size={13} aria-hidden="true" />
            </Link>
            <Button variant="ghost" size="sm" onClick={() => void logout()}>Sign out</Button>
          </div>
        </header>

        <main id="main-content" className="content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
