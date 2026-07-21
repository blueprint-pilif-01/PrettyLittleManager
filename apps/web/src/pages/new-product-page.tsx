import {
  ArrowLeft,
  FloppyDisk,
  Info,
  Package,
  Plus,
  ShieldCheck,
  Stack,
  Tag,
  Trash,
  Truck,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  EditorSectionHeading,
  ProductEditorField,
} from "../components/product-editor-field";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { api, errorMessage } from "../lib/api";

type Reference = { id: string; name: string };
type WorkspaceContext = {
  company: {
    settings?: {
      defaultLanguage?: string;
      defaultCurrency?: string;
      defaultVatRate?: string;
      defaultWeightUnit?: string;
      defaultDimensionUnit?: string;
    };
  };
};
type CreatedProduct = { id: string };
type FamilyAxisDraft = {
  id: number;
  key: string;
  label: string;
  value: string;
  keyEdited: boolean;
};
type FamilyReference = {
  id: string;
  sellerFamilyId?: number;
  code: string;
  name: string;
  status: string;
  variationAxes: Array<{ key: string; label: string }>;
};

let nextAxisId = 2;

function optional(data: FormData, name: string) {
  const value = String(data.get(name) ?? "").trim();
  return value || undefined;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

function axisKey(value: string) {
  return slugify(value).replaceAll("-", "_").slice(0, 100);
}

const baseSections = [
  { id: "identity", label: "Identity", icon: Package },
  { id: "content", label: "Content", icon: Tag },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "commercial", label: "Commercial", icon: Truck },
];

export function NewProductPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedFamilyId = searchParams.get("familyId") ?? "";
  const [familyMode, setFamilyMode] = useState<"NONE" | "NEW" | "EXISTING">(
    requestedFamilyId ? "EXISTING" : "NONE",
  );
  const [selectedFamilyId, setSelectedFamilyId] = useState(requestedFamilyId);
  const [existingFamilyValues, setExistingFamilyValues] = useState<
    Record<string, string>
  >({});
  const [publicName, setPublicName] = useState("");
  const [internalName, setInternalName] = useState("");
  const [internalNameEdited, setInternalNameEdited] = useState(false);
  const [variantName, setVariantName] = useState("");
  const [variantNameEdited, setVariantNameEdited] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [familyAxes, setFamilyAxes] = useState<FamilyAxisDraft[]>([
    { id: 1, key: "size", label: "Size", value: "", keyEdited: false },
  ]);
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Reference[]>("/categories"),
  });
  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => api<Reference[]>("/brands"),
  });
  const families = useQuery({
    queryKey: ["families"],
    queryFn: () => api<FamilyReference[]>("/product-families"),
  });
  const context = useQuery({
    queryKey: ["workspace-context"],
    queryFn: () => api<WorkspaceContext>("/workspace/context"),
  });
  const defaults = useMemo(
    () => ({
      language: context.data?.company.settings?.defaultLanguage ?? "ro",
      currency: context.data?.company.settings?.defaultCurrency ?? "RON",
      vatRate: context.data?.company.settings?.defaultVatRate ?? "19",
      weightUnit: context.data?.company.settings?.defaultWeightUnit ?? "kg",
      dimensionUnit:
        context.data?.company.settings?.defaultDimensionUnit ?? "cm",
    }),
    [context.data],
  );
  const sections =
    familyMode !== "NONE"
      ? [
          ...baseSections,
          { id: "family", label: "Product family", icon: Stack },
        ]
      : baseSections;

  const create = useMutation({
    mutationFn: (input: unknown) =>
      api<CreatedProduct>("/products", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (product) =>
      navigate(`/products/${product.id}`, {
        replace: true,
        state: { created: true },
      }),
  });

  function updateAxis(id: number, patch: Partial<FamilyAxisDraft>) {
    setFamilyAxes((current) =>
      current.map((axis) => (axis.id === id ? { ...axis, ...patch } : axis)),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const variationValues =
      familyMode === "NEW"
        ? Object.fromEntries(
            familyAxes.map((axis) => [axis.key.trim(), axis.value.trim()]),
          )
        : familyMode === "EXISTING"
          ? existingFamilyValues
          : {};
    create.mutate({
      productType: "SIMPLE",
      status: "DRAFT",
      internalName: String(data.get("internalName")),
      publicName: String(data.get("publicName")),
      shortName: optional(data, "shortName"),
      slug: String(data.get("slug")),
      brandId: optional(data, "brandId"),
      categoryId: optional(data, "categoryId"),
      description: optional(data, "description"),
      shortDescription: optional(data, "shortDescription"),
      gs1LabelDescription: optional(data, "gs1LabelDescription"),
      safetyInformation: optional(data, "safetyInformation"),
      manufacturerPartNumber: optional(data, "manufacturerPartNumber"),
      manufacturerName: optional(data, "manufacturerName"),
      manufacturerAddress: optional(data, "manufacturerAddress"),
      manufacturerEmail: optional(data, "manufacturerEmail"),
      euResponsiblePersonName: optional(data, "euResponsiblePersonName"),
      euResponsiblePersonAddress: optional(data, "euResponsiblePersonAddress"),
      euResponsiblePersonEmail: optional(data, "euResponsiblePersonEmail"),
      seoTitle: optional(data, "seoTitle"),
      seoDescription: optional(data, "seoDescription"),
      defaultLanguage: String(data.get("defaultLanguage")),
      defaultCurrency: String(data.get("defaultCurrency")),
      defaultVatRate: optional(data, "defaultVatRate"),
      taxClass: optional(data, "taxClass"),
      weight: optional(data, "weight"),
      weightUnit: optional(data, "weightUnit"),
      length: optional(data, "length"),
      width: optional(data, "width"),
      height: optional(data, "height"),
      diameter: optional(data, "diameter"),
      dimensionUnit: optional(data, "dimensionUnit"),
      defaultVariant: {
        sku: String(data.get("sku")),
        internalNumericId: Number(data.get("internalNumericId")),
        variantName: String(data.get("variantName")),
        status: "DRAFT",
        gtin: optional(data, "gtin"),
        basePrice: optional(data, "basePrice"),
        costPrice: optional(data, "costPrice"),
        currency: String(data.get("defaultCurrency")),
        isDefaultVariant: true,
        variationValues,
      },
      family:
        familyMode === "NEW"
          ? {
              sellerFamilyId: Number(data.get("sellerFamilyId")),
              code: String(data.get("familyCode")),
              name: String(data.get("familyName")),
              description: optional(data, "familyDescription"),
              variationAxes: familyAxes.map((axis) => ({
                key: axis.key.trim(),
                label: axis.label.trim(),
              })),
            }
          : undefined,
      existingFamilyId:
        familyMode === "EXISTING" ? selectedFamilyId : undefined,
    });
  }

  const numericId = useMemo(() => Math.max(1, Date.now() % 16_000_000), []);
  const familyNumericId = useMemo(
    () => Math.max(1, (Date.now() + 7_919) % 2_000_000_000),
    [],
  );
  const selectedFamily = families.data?.find(
    (family) => family.id === selectedFamilyId,
  );

  return (
    <form className="editor-page" onSubmit={submit}>
      <header className="editor-header">
        <div className="editor-heading">
          <Button asChild variant="ghost" size="icon">
            <Link to="/products" aria-label="Back to products">
              <ArrowLeft size={18} />
            </Link>
          </Button>
          <div>
            <span>New catalog item</span>
            <h1>{publicName || "Untitled product"}</h1>
            <p>Product, primary variant, and family are created together.</p>
          </div>
        </div>
        <div className="editor-actions">
          <Button asChild variant="secondary">
            <Link to="/products">Cancel</Link>
          </Button>
          <Button type="submit" disabled={create.isPending}>
            <FloppyDisk size={16} />
            {create.isPending ? "Creating…" : "Create product"}
          </Button>
        </div>
      </header>

      <div className="editor-layout">
        <aside className="editor-nav" aria-label="Product editor sections">
          {sections.map(({ id, label, icon: Icon }) => (
            <a key={id} href={`#${id}`}>
              <Icon size={16} />
              <span>{label}</span>
            </a>
          ))}
          <div className="editor-nav-note">
            <Info size={15} />
            <span>
              Examples below each field show the expected format. eMAG-only
              offer data is configured later in the channel draft.
            </span>
          </div>
        </aside>

        <div className="editor-content">
          <section className="editor-section" id="identity">
            <EditorSectionHeading
              title="Identity"
              description="Define what this item is, how operators recognize it, and where it belongs in the catalog."
            />
            <div
              className="choice-row three-choices"
              role="radiogroup"
              aria-label="Family membership"
            >
              <label
                className={
                  familyMode === "NONE"
                    ? "choice-option selected"
                    : "choice-option"
                }
              >
                <input
                  type="radio"
                  name="familyMode"
                  value="NONE"
                  checked={familyMode === "NONE"}
                  onChange={() => setFamilyMode("NONE")}
                />
                <span>
                  <strong>Standalone product</strong>
                  <small>One sellable product with its own SKU and EAN.</small>
                </span>
              </label>
              <label
                className={
                  familyMode === "NEW"
                    ? "choice-option selected"
                    : "choice-option"
                }
              >
                <input
                  type="radio"
                  name="familyMode"
                  value="NEW"
                  checked={familyMode === "NEW"}
                  onChange={() => setFamilyMode("NEW")}
                />
                <span>
                  <strong>Start a new family</strong>
                  <small>This is the first size or color in a new group.</small>
                </span>
              </label>
              <label
                className={
                  familyMode === "EXISTING"
                    ? "choice-option selected"
                    : "choice-option"
                }
              >
                <input
                  type="radio"
                  name="familyMode"
                  value="EXISTING"
                  checked={familyMode === "EXISTING"}
                  onChange={() => setFamilyMode("EXISTING")}
                />
                <span>
                  <strong>Add to existing family</strong>
                  <small>
                    Create another sellable product linked to a current group.
                  </small>
                </span>
              </label>
            </div>
            <div className="editor-fields two-up">
              <ProductEditorField
                name="publicName"
                label="Public product name"
                help="Customer-facing title. Example: Medical scrub set Lia, premium cotton, burgundy."
              >
                <Input
                  id="publicName"
                  name="publicName"
                  value={publicName}
                  placeholder="Medical scrub set Lia, premium cotton, burgundy"
                  aria-describedby="publicName-help"
                  onChange={(event) => {
                    const next = event.target.value;
                    setPublicName(next);
                    if (!slugEdited) setSlug(slugify(next));
                    if (!internalNameEdited) setInternalName(next);
                    if (!variantNameEdited) setVariantName(next);
                  }}
                  required
                  minLength={2}
                  autoFocus
                />
              </ProductEditorField>
              <ProductEditorField
                name="internalName"
                label="Internal name"
                help="The name your team searches for; it may include a supplier or collection code. Example: Lia scrub set AW26."
              >
                <Input
                  id="internalName"
                  name="internalName"
                  value={internalName}
                  placeholder="Lia scrub set AW26"
                  aria-describedby="internalName-help"
                  onChange={(event) => {
                    setInternalNameEdited(true);
                    setInternalName(event.target.value);
                  }}
                  required
                  minLength={2}
                />
              </ProductEditorField>
            </div>
            <div className="editor-fields three-up">
              <ProductEditorField
                name="shortName"
                label="Short name"
                optional
                help="Compact label for narrow layouts and exports. Example: Lia scrub set."
              >
                <Input
                  id="shortName"
                  name="shortName"
                  placeholder="Lia scrub set"
                  aria-describedby="shortName-help"
                  maxLength={100}
                />
              </ProductEditorField>
              <ProductEditorField
                name="slug"
                label="URL slug"
                help="Stable lowercase URL segment; generated from the public name. Example: medical-scrub-set-lia."
              >
                <Input
                  id="slug"
                  name="slug"
                  value={slug}
                  placeholder="medical-scrub-set-lia"
                  aria-describedby="slug-help"
                  onChange={(event) => {
                    setSlugEdited(true);
                    setSlug(event.target.value);
                  }}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  required
                />
              </ProductEditorField>
              <ProductEditorField
                name="categoryId"
                label="Internal category"
                optional
                help="Your canonical category; eMAG category mapping is configured separately. Example: Workwear."
              >
                <select
                  id="categoryId"
                  name="categoryId"
                  className="select-control"
                  aria-describedby="categoryId-help"
                >
                  <option value="">Choose a category</option>
                  {categories.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </ProductEditorField>
            </div>
            <div className="editor-fields">
              <ProductEditorField
                name="brandId"
                label="Brand"
                optional
                help="The brand printed on the product and sent to channels. Example: Lia Veselie."
              >
                <select
                  id="brandId"
                  name="brandId"
                  className="select-control"
                  aria-describedby="brandId-help"
                >
                  <option value="">Choose a brand</option>
                  {brands.data?.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </ProductEditorField>
            </div>
          </section>

          <section className="editor-section" id="content">
            <EditorSectionHeading
              title="Content"
              description="Write reusable source copy for websites and marketplaces. Keep channel-specific formatting in the channel listing."
            />
            <div className="editor-fields">
              <ProductEditorField
                name="shortDescription"
                label="Short description"
                optional
                help="One or two sentences for listings and previews. Example: Soft, breathable medical set with a V-neck top and elastic-waist trousers."
              >
                <textarea
                  id="shortDescription"
                  name="shortDescription"
                  className="select-control textarea-control"
                  placeholder="Soft, breathable medical set with a V-neck top and elastic-waist trousers."
                  aria-describedby="shortDescription-help"
                  maxLength={2000}
                />
              </ProductEditorField>
              <ProductEditorField
                name="description"
                label="Full description"
                optional
                help="Complete benefits, materials, fit, and package contents. Use short paragraphs and factual bullet points."
              >
                <textarea
                  id="description"
                  name="description"
                  className="select-control textarea-control tall"
                  placeholder="Describe the product, material, fit, care instructions, and what is included in the package…"
                  aria-describedby="description-help"
                  maxLength={100000}
                />
              </ProductEditorField>
            </div>
            <div className="editor-fields two-up">
              <ProductEditorField
                name="seoTitle"
                label="SEO title"
                optional
                help="Search title, usually 50–60 characters. Example: Lia Burgundy Medical Scrub Set."
              >
                <Input
                  id="seoTitle"
                  name="seoTitle"
                  placeholder="Lia Burgundy Medical Scrub Set"
                  aria-describedby="seoTitle-help"
                  maxLength={180}
                />
              </ProductEditorField>
              <ProductEditorField
                name="seoDescription"
                label="SEO description"
                optional
                help="A clear search snippet around 140–160 characters; do not repeat keywords unnaturally."
              >
                <Input
                  id="seoDescription"
                  name="seoDescription"
                  placeholder="Premium cotton medical scrub set with a comfortable classic fit…"
                  aria-describedby="seoDescription-help"
                  maxLength={500}
                />
              </ProductEditorField>
            </div>
          </section>

          <section className="editor-section" id="compliance">
            <EditorSectionHeading
              title="Compliance"
              description="Store the manufacturer, EU responsible person, and safety copy required by GPSR and marketplace rules."
            />
            <div className="editor-fields two-up">
              <ProductEditorField
                name="manufacturerName"
                label="Manufacturer"
                optional
                help="Legal company name, not the consumer brand. Example: SC Aline Textile SRL."
              >
                <Input
                  id="manufacturerName"
                  name="manufacturerName"
                  placeholder="SC Aline Textile SRL"
                  aria-describedby="manufacturerName-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="manufacturerPartNumber"
                label="Manufacturer part number"
                optional
                help="Manufacturer’s stable model or article code. If none exists, the SKU remains the internal identifier."
              >
                <Input
                  id="manufacturerPartNumber"
                  name="manufacturerPartNumber"
                  placeholder="LIA-SCRUB-2026"
                  aria-describedby="manufacturerPartNumber-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="manufacturerAddress"
                label="Manufacturer address"
                optional
                help="Full postal address shown in product-safety information. Example: Str. Fabricii 10, Timișoara, Romania."
              >
                <Input
                  id="manufacturerAddress"
                  name="manufacturerAddress"
                  placeholder="Str. Fabricii 10, Timișoara, Romania"
                  aria-describedby="manufacturerAddress-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="manufacturerEmail"
                label="Manufacturer email"
                optional
                help="Public contact for product compliance, not a personal login. Example: compliance@aline.ro."
              >
                <Input
                  id="manufacturerEmail"
                  name="manufacturerEmail"
                  type="email"
                  placeholder="compliance@aline.ro"
                  aria-describedby="manufacturerEmail-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="euResponsiblePersonName"
                label="EU responsible person"
                optional
                help="Required when the manufacturer is outside the EU. Enter the legal representative’s name."
              >
                <Input
                  id="euResponsiblePersonName"
                  name="euResponsiblePersonName"
                  placeholder="EU representative legal name"
                  aria-describedby="euResponsiblePersonName-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="euResponsiblePersonEmail"
                label="EU representative email"
                optional
                help="Public compliance email of the EU representative. Example: gpsr@example.eu."
              >
                <Input
                  id="euResponsiblePersonEmail"
                  name="euResponsiblePersonEmail"
                  type="email"
                  placeholder="gpsr@example.eu"
                  aria-describedby="euResponsiblePersonEmail-help"
                />
              </ProductEditorField>
            </div>
            <div className="editor-fields">
              <ProductEditorField
                name="euResponsiblePersonAddress"
                label="EU representative address"
                optional
                help="Full EU postal address of the responsible person; leave empty when not applicable."
              >
                <Input
                  id="euResponsiblePersonAddress"
                  name="euResponsiblePersonAddress"
                  placeholder="Street, number, city, postal code, EU country"
                  aria-describedby="euResponsiblePersonAddress-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="safetyInformation"
                label="Safety information"
                optional
                help="Warnings and safe-use instructions supplied with the product. Example: Keep away from open flame; follow the care label."
              >
                <textarea
                  id="safetyInformation"
                  name="safetyInformation"
                  className="select-control textarea-control"
                  placeholder="Keep away from open flame. Follow the washing and care instructions on the label."
                  aria-describedby="safetyInformation-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="gs1LabelDescription"
                label="GS1 label description"
                optional
                help="Short factual wording used during GS1 registration. Example: Women’s medical scrub set, cotton blend."
              >
                <Input
                  id="gs1LabelDescription"
                  name="gs1LabelDescription"
                  placeholder="Women’s medical scrub set, cotton blend"
                  aria-describedby="gs1LabelDescription-help"
                  maxLength={500}
                />
              </ProductEditorField>
            </div>
          </section>

          <section className="editor-section" id="commercial">
            <EditorSectionHeading
              title="Commercial and logistics"
              description="Create the first sellable SKU and record canonical pricing and packed-product measurements."
            />
            <h3 className="editor-subheading">Primary variant</h3>
            <div className="editor-fields three-up">
              <ProductEditorField
                name="sku"
                label="SKU"
                help="Your unique stock code. Use letters, numbers, dots, dashes, or underscores. Example: CMD-VISINIU-XL."
              >
                <Input
                  id="sku"
                  name="sku"
                  placeholder="CMD-VISINIU-XL"
                  aria-describedby="sku-help"
                  required
                  pattern="[A-Za-z0-9._-]{2,64}"
                />
              </ProductEditorField>
              <ProductEditorField
                name="variantName"
                label="Variant name"
                help="Human-readable option name. For a simple product, reuse the product name; for a family, include the choices."
              >
                <Input
                  id="variantName"
                  name="variantName"
                  value={variantName}
                  placeholder="Burgundy / XL"
                  aria-describedby="variantName-help"
                  onChange={(event) => {
                    setVariantNameEdited(true);
                    setVariantName(event.target.value);
                  }}
                  required
                />
              </ProductEditorField>
              <ProductEditorField
                name="internalNumericId"
                label="Seller numeric ID"
                help="Stable numeric identifier used by marketplace integrations. The suggested value is unique inside this workspace."
              >
                <Input
                  id="internalNumericId"
                  name="internalNumericId"
                  type="number"
                  min={1}
                  max={16777215}
                  defaultValue={numericId}
                  aria-describedby="internalNumericId-help"
                  required
                />
              </ProductEditorField>
              <ProductEditorField
                name="basePrice"
                label="Base sale price"
                optional
                help="Canonical selling price before channel-specific rules. Example: 159.00. eMAG offer thresholds are configured in its draft."
              >
                <Input
                  id="basePrice"
                  name="basePrice"
                  inputMode="decimal"
                  placeholder="159.00"
                  aria-describedby="basePrice-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="costPrice"
                label="Cost price"
                optional
                help="Internal acquisition or production cost; never published to customers. Example: 72.50."
              >
                <Input
                  id="costPrice"
                  name="costPrice"
                  inputMode="decimal"
                  placeholder="72.50"
                  aria-describedby="costPrice-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="gtin"
                label="GTIN / EAN"
                optional
                help="Valid GS1 barcode including its check digit. Example format: 5941234123453. Leave empty until assigned."
              >
                <Input
                  id="gtin"
                  name="gtin"
                  inputMode="numeric"
                  placeholder="5941234123453"
                  aria-describedby="gtin-help"
                />
              </ProductEditorField>
            </div>
            <h3 className="editor-subheading">Defaults</h3>
            <div className="editor-fields three-up">
              <ProductEditorField
                name="defaultLanguage"
                label="Source language"
                help="ISO language code used for canonical content. Example: ro."
              >
                <Input
                  key={`language-${defaults.language}`}
                  id="defaultLanguage"
                  name="defaultLanguage"
                  defaultValue={defaults.language}
                  placeholder="ro"
                  aria-describedby="defaultLanguage-help"
                  required
                />
              </ProductEditorField>
              <ProductEditorField
                name="defaultCurrency"
                label="Currency"
                help="Three-letter ISO code for prices. Example: RON."
              >
                <Input
                  key={`currency-${defaults.currency}`}
                  id="defaultCurrency"
                  name="defaultCurrency"
                  defaultValue={defaults.currency}
                  placeholder="RON"
                  aria-describedby="defaultCurrency-help"
                  maxLength={3}
                  required
                />
              </ProductEditorField>
              <ProductEditorField
                name="defaultVatRate"
                label="Default VAT rate"
                optional
                help="Percentage without the % sign. Example: 19. The eMAG VAT ID is selected in the channel draft."
              >
                <Input
                  key={`vat-${defaults.vatRate}`}
                  id="defaultVatRate"
                  name="defaultVatRate"
                  defaultValue={defaults.vatRate}
                  placeholder="19"
                  aria-describedby="defaultVatRate-help"
                  inputMode="decimal"
                />
              </ProductEditorField>
              <ProductEditorField
                name="weight"
                label="Packed weight"
                optional
                help="Shipping weight for one sellable unit, using the unit beside it. Example: 0.45 kg."
              >
                <Input
                  id="weight"
                  name="weight"
                  inputMode="decimal"
                  placeholder="0.45"
                  aria-describedby="weight-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="weightUnit"
                label="Weight unit"
                optional
                help="Unit used by the weight value. Prefer kg or g and keep it consistent across the catalog."
              >
                <Input
                  key={`weight-${defaults.weightUnit}`}
                  id="weightUnit"
                  name="weightUnit"
                  defaultValue={defaults.weightUnit}
                  placeholder="kg"
                  aria-describedby="weightUnit-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="taxClass"
                label="Tax class"
                optional
                help="Internal tax rule name when VAT is not sufficient. Example: standard-goods."
              >
                <Input
                  id="taxClass"
                  name="taxClass"
                  placeholder="standard-goods"
                  aria-describedby="taxClass-help"
                />
              </ProductEditorField>
            </div>
            <h3 className="editor-subheading">Packed dimensions</h3>
            <div className="editor-fields five-up">
              <ProductEditorField
                name="length"
                label="Length"
                optional
                help="Longest packed side. Example: 30."
              >
                <Input
                  id="length"
                  name="length"
                  inputMode="decimal"
                  placeholder="30"
                  aria-describedby="length-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="width"
                label="Width"
                optional
                help="Second packed side. Example: 20."
              >
                <Input
                  id="width"
                  name="width"
                  inputMode="decimal"
                  placeholder="20"
                  aria-describedby="width-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="height"
                label="Height"
                optional
                help="Smallest packed side. Example: 4."
              >
                <Input
                  id="height"
                  name="height"
                  inputMode="decimal"
                  placeholder="4"
                  aria-describedby="height-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="diameter"
                label="Diameter"
                optional
                help="Only for cylindrical packages; otherwise leave empty."
              >
                <Input
                  id="diameter"
                  name="diameter"
                  inputMode="decimal"
                  placeholder="—"
                  aria-describedby="diameter-help"
                />
              </ProductEditorField>
              <ProductEditorField
                name="dimensionUnit"
                label="Dimension unit"
                optional
                help="Unit shared by all four measurements. Prefer cm or mm."
              >
                <Input
                  key={`dimension-${defaults.dimensionUnit}`}
                  id="dimensionUnit"
                  name="dimensionUnit"
                  defaultValue={defaults.dimensionUnit}
                  placeholder="cm"
                  aria-describedby="dimensionUnit-help"
                />
              </ProductEditorField>
            </div>
          </section>

          {familyMode !== "NONE" && (
            <section className="editor-section" id="family">
              <EditorSectionHeading
                title="Product family"
                description="Each size or color remains a separate sellable product. The family reconnects them for websites and eMAG."
                aside={
                  <span className="editor-section-kicker">
                    <Stack size={15} /> Linked on create
                  </span>
                }
              />
              <div className="concept-note">
                <Info size={18} />
                <div>
                  <strong>One product, one SKU, one EAN</strong>
                  <p>
                    This page creates only the current sellable item. Other
                    sizes and colors are separate products that share the same
                    seller family ID, name, and eMAG family type.
                  </p>
                </div>
              </div>
              {familyMode === "NEW" ? (
                <>
                  <div className="editor-fields three-up">
                    <ProductEditorField
                      name="familyName"
                      label="Family name"
                      help="Shared customer-facing name without option values. Example: Lia medical scrub set."
                    >
                      <Input
                        id="familyName"
                        name="familyName"
                        placeholder="Lia medical scrub set"
                        aria-describedby="familyName-help"
                        required
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="familyCode"
                      label="Family code"
                      help="Stable internal code shared by all variants. Example: LIA-SCRUB-SET."
                    >
                      <Input
                        id="familyCode"
                        name="familyCode"
                        placeholder="LIA-SCRUB-SET"
                        aria-describedby="familyCode-help"
                        pattern="[A-Za-z0-9._-]+"
                        required
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="sellerFamilyId"
                      label="Seller family ID"
                      help="Stable numeric ID sent unchanged on every eMAG product in this family. Never reuse it for another family."
                    >
                      <Input
                        id="sellerFamilyId"
                        name="sellerFamilyId"
                        type="number"
                        min={1}
                        max={2147483647}
                        defaultValue={familyNumericId}
                        aria-describedby="sellerFamilyId-help"
                        required
                      />
                    </ProductEditorField>
                  </div>
                  <div className="editor-fields">
                    <ProductEditorField
                      name="familyDescription"
                      label="Family description"
                      optional
                      help="Optional internal note describing what belongs to this family; it is not the product sales description."
                    >
                      <Input
                        id="familyDescription"
                        name="familyDescription"
                        placeholder="All Lia scrub sets with the same cut and material"
                        aria-describedby="familyDescription-help"
                      />
                    </ProductEditorField>
                  </div>
                  <div className="family-axis-heading">
                    <div>
                      <h3>Variation axes</h3>
                      <p>
                        Add only choices that create distinct sellable SKUs. The
                        first variant needs one value for every axis.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={familyAxes.length >= 5}
                      onClick={() =>
                        setFamilyAxes((current) => [
                          ...current,
                          {
                            id: nextAxisId++,
                            key: "",
                            label: "",
                            value: "",
                            keyEdited: false,
                          },
                        ])
                      }
                    >
                      <Plus size={14} /> Add axis
                    </Button>
                  </div>
                  <div className="family-axis-list">
                    {familyAxes.map((axis, index) => (
                      <div className="family-axis-row" key={axis.id}>
                        <span className="axis-index">{index + 1}</span>
                        <ProductEditorField
                          name={`axis-label-${axis.id}`}
                          label="Choice label"
                          help="Customer-facing label. Example: Size or Color."
                        >
                          <Input
                            id={`axis-label-${axis.id}`}
                            value={axis.label}
                            placeholder="Size"
                            aria-describedby={`axis-label-${axis.id}-help`}
                            onChange={(event) => {
                              const label = event.target.value;
                              updateAxis(axis.id, {
                                label,
                                ...(!axis.keyEdited
                                  ? { key: axisKey(label) }
                                  : {}),
                              });
                            }}
                            required
                          />
                        </ProductEditorField>
                        <ProductEditorField
                          name={`axis-key-${axis.id}`}
                          label="Attribute key"
                          help="Stable machine key; do not translate it later. Example: size or color."
                        >
                          <Input
                            id={`axis-key-${axis.id}`}
                            value={axis.key}
                            placeholder="size"
                            aria-describedby={`axis-key-${axis.id}-help`}
                            pattern="[a-z][a-z0-9_]*"
                            onChange={(event) =>
                              updateAxis(axis.id, {
                                key: event.target.value,
                                keyEdited: true,
                              })
                            }
                            required
                          />
                        </ProductEditorField>
                        <ProductEditorField
                          name={`axis-value-${axis.id}`}
                          label="First variant value"
                          help="Value for the SKU created above. Example: XL or Burgundy."
                        >
                          <Input
                            id={`axis-value-${axis.id}`}
                            value={axis.value}
                            placeholder={
                              axis.key === "color" ? "Burgundy" : "XL"
                            }
                            aria-describedby={`axis-value-${axis.id}-help`}
                            onChange={(event) =>
                              updateAxis(axis.id, { value: event.target.value })
                            }
                            required
                          />
                        </ProductEditorField>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove variation axis ${index + 1}`}
                          disabled={familyAxes.length === 1}
                          onClick={() =>
                            setFamilyAxes((current) =>
                              current.filter((item) => item.id !== axis.id),
                            )
                          }
                        >
                          <Trash size={15} />
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div className="editor-fields">
                    <ProductEditorField
                      name="existingFamilyId"
                      label="Existing family"
                      help="Choose the family that should appear as one group on websites and eMAG."
                    >
                      <select
                        id="existingFamilyId"
                        className="select-control"
                        value={selectedFamilyId}
                        onChange={(event) => {
                          setSelectedFamilyId(event.target.value);
                          setExistingFamilyValues({});
                        }}
                        aria-describedby="existingFamilyId-help"
                        required
                      >
                        <option value="">Choose a family</option>
                        {families.data
                          ?.filter((family) => family.status !== "ARCHIVED")
                          .map((family) => (
                            <option key={family.id} value={family.id}>
                              {family.name} · ID{" "}
                              {family.sellerFamilyId ?? "missing"} ·{" "}
                              {family.code}
                            </option>
                          ))}
                      </select>
                    </ProductEditorField>
                  </div>
                  {selectedFamily && (
                    <div className="family-axis-list">
                      {selectedFamily.variationAxes.map((axis, index) => (
                        <div
                          className="family-axis-row existing-axis"
                          key={axis.key}
                        >
                          <span className="axis-index">{index + 1}</span>
                          <ProductEditorField
                            name={`existing-axis-${axis.key}`}
                            label={axis.label}
                            help={`Value for this product under the family attribute ${axis.key}. It must form a unique combination.`}
                          >
                            <Input
                              id={`existing-axis-${axis.key}`}
                              value={existingFamilyValues[axis.key] ?? ""}
                              placeholder={
                                axis.key === "color" ? "Burgundy" : "XL"
                              }
                              aria-describedby={`existing-axis-${axis.key}-help`}
                              onChange={(event) =>
                                setExistingFamilyValues((current) => ({
                                  ...current,
                                  [axis.key]: event.target.value,
                                }))
                              }
                              required
                            />
                          </ProductEditorField>
                        </div>
                      ))}
                    </div>
                  )}
                  {!families.isLoading && !families.data?.length && (
                    <div className="form-note">
                      <Info size={16} />
                      <span>
                        No family exists yet. Choose “Start a new family” for
                        the first product.
                      </span>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {create.error && (
            <p className="form-alert editor-error" role="alert">
              {errorMessage(create.error)}
            </p>
          )}
          <div className="editor-footer">
            <span>
              {familyMode === "NONE"
                ? "Creates one product with one sellable SKU and EAN."
                : "Creates one sellable product and links it to the selected family."}
            </span>
            <Button type="submit" disabled={create.isPending}>
              <FloppyDisk size={16} />
              {create.isPending ? "Creating…" : "Create product"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
