import {
  ArrowLeft,
  FloppyDisk,
  Image as ImageIcon,
  Info,
  Package,
  PencilSimple,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Stack,
  Tag,
  Trash,
  Truck,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  EditorSectionHeading,
  ProductEditorField,
} from "../components/product-editor-field";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { api, errorMessage } from "../lib/api";

type Reference = { id: string; name: string };
type AttributeDefinition = {
  id: string;
  key: string;
  displayName: string;
  description?: string;
  dataType: string;
  scope: "PRODUCT" | "VARIANT";
  isRequired: boolean;
};
type AttributeValue = {
  definitionId: string;
  value: unknown;
  definition: AttributeDefinition;
};
type FamilyAxis = { attributeDefinitionId: string; key: string; label: string };
type Variant = {
  id: string;
  sku: string;
  internalNumericId: number;
  variantName: string;
  status: string;
  gtin?: string;
  basePrice?: string;
  costPrice?: string;
  currency: string;
  weight?: string;
  weightUnit?: string;
  length?: string;
  width?: string;
  height?: string;
  diameter?: string;
  dimensionUnit?: string;
  isDefaultVariant: boolean;
  variationValues: Record<string, string>;
  attributeValues?: AttributeValue[];
};
type ImageAssignment = {
  id: string;
  role: "MAIN" | "SECONDARY" | "OTHER";
  position: number;
  altText?: string;
  image: {
    id: string;
    originalFileName: string;
    thumbnailUrl?: string;
    mediumUrl?: string;
    publicUrl?: string;
  };
};
type ProductFamily = {
  id: string;
  sellerFamilyId?: number;
  code: string;
  name: string;
  description?: string;
  status: "DRAFT" | "READY" | "ACTIVE" | "ARCHIVED";
  variationAxes: FamilyAxis[];
  members: Array<{ variantId: string; position: number }>;
};
type Product = {
  id: string;
  productType: "SIMPLE" | "PARENT";
  status: "DRAFT" | "READY" | "ACTIVE" | "ARCHIVED";
  internalName: string;
  publicName: string;
  shortName?: string;
  slug: string;
  brandId?: string;
  categoryId?: string;
  description?: string;
  shortDescription?: string;
  gs1LabelDescription?: string;
  safetyInformation?: string;
  manufacturerPartNumber?: string;
  manufacturerName?: string;
  manufacturerAddress?: string;
  manufacturerEmail?: string;
  euResponsiblePersonName?: string;
  euResponsiblePersonAddress?: string;
  euResponsiblePersonEmail?: string;
  seoTitle?: string;
  seoDescription?: string;
  defaultLanguage: string;
  taxClass?: string;
  defaultVatRate?: string;
  defaultCurrency: string;
  weight?: string;
  weightUnit?: string;
  length?: string;
  width?: string;
  height?: string;
  diameter?: string;
  dimensionUnit?: string;
  family?: ProductFamily;
  variants: Variant[];
  attributeValues: AttributeValue[];
  imageAssignments: ImageAssignment[];
};

function optional(data: FormData, name: string) {
  const value = String(data.get(name) ?? "").trim();
  return value || undefined;
}

function parseAttributeValue(
  value: FormDataEntryValue | null,
  definition: AttributeDefinition,
) {
  const raw = String(value ?? "").trim();
  if (!raw) return undefined;
  if (definition.dataType === "BOOLEAN") return raw === "true";
  if (definition.dataType === "INTEGER") return Number.parseInt(raw, 10);
  if (definition.dataType === "DECIMAL") return raw;
  if (definition.dataType === "JSON") return JSON.parse(raw) as unknown;
  return raw;
}

function attributeHelp(definition: AttributeDefinition) {
  if (definition.description) return definition.description;
  const examples: Record<string, string> = {
    BOOLEAN: "Choose Yes or No.",
    COLOR: "Example: Burgundy.",
    DECIMAL: "Enter a decimal number without extra text. Example: 12.5.",
    INTEGER: "Enter a whole number. Example: 5.",
    JSON: "Advanced field: enter a valid JSON value.",
    MEASUREMENT: "Enter the numeric value expected by this attribute.",
  };
  return (
    examples[definition.dataType] ??
    `Catalog field ${definition.key}; enter the factual product value.`
  );
}

const sections = [
  { id: "identity", label: "Identity", icon: Package },
  { id: "content", label: "Content", icon: Tag },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "commercial", label: "Commercial", icon: Truck },
  { id: "family", label: "Product family", icon: Stack },
  { id: "variants", label: "SKU & barcode", icon: SlidersHorizontal },
  { id: "media", label: "Images", icon: ImageIcon },
  { id: "attributes", label: "Attributes", icon: Tag },
];

export function ProductDetailPage() {
  const { id = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [notice, setNotice] = useState(
    (location.state as { created?: boolean } | null)?.created
      ? "Product created. You can now add images, more variants, stock, and channel data."
      : "",
  );
  const [attributeError, setAttributeError] = useState("");
  const [editingVariantId, setEditingVariantId] = useState("");
  const [attributeVariantId, setAttributeVariantId] = useState("");

  const product = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<Product>(`/products/${id}`),
    enabled: Boolean(id),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Reference[]>("/categories"),
  });
  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => api<Reference[]>("/brands"),
  });
  const attributes = useQuery({
    queryKey: ["attributes"],
    queryFn: () => api<AttributeDefinition[]>("/attributes"),
  });
  const productAttributes = useMemo(
    () => attributes.data?.filter((item) => item.scope === "PRODUCT") ?? [],
    [attributes.data],
  );
  const variantAttributes = useMemo(
    () => attributes.data?.filter((item) => item.scope === "VARIANT") ?? [],
    [attributes.data],
  );
  const valuesByDefinition = useMemo(
    () =>
      new Map(
        product.data?.attributeValues.map((item) => [
          item.definitionId,
          item.value,
        ]) ?? [],
      ),
    [product.data?.attributeValues],
  );

  async function refresh() {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["product", id] }),
      client.invalidateQueries({ queryKey: ["products"] }),
      client.invalidateQueries({ queryKey: ["families"] }),
    ]);
  }

  const update = useMutation({
    mutationFn: async ({
      productInput,
      familyInput,
    }: {
      productInput: unknown;
      familyInput?: unknown;
    }) => {
      await api(`/products/${id}`, {
        method: "PATCH",
        body: JSON.stringify(productInput),
      });
      if (familyInput && product.data?.family) {
        await api(`/product-families/${product.data.family.id}`, {
          method: "PATCH",
          body: JSON.stringify(familyInput),
        });
      }
    },
    onSuccess: async () => {
      setNotice("Product saved.");
      await refresh();
    },
  });
  const archive = useMutation({
    mutationFn: () => api(`/products/${id}`, { method: "DELETE" }),
    onSuccess: () => navigate("/products"),
  });
  const addVariant = useMutation({
    mutationFn: (input: unknown) =>
      api(`/products/${id}/variants`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setNotice("Variant created and attached to the family when applicable.");
      await refresh();
    },
  });
  const archiveVariant = useMutation({
    mutationFn: (variantId: string) =>
      api(`/products/${id}/variants/${variantId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const updateVariant = useMutation({
    mutationFn: ({ variantId, input }: { variantId: string; input: unknown }) =>
      api(`/products/${id}/variants/${variantId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setEditingVariantId("");
      setNotice("Variant saved.");
      await refresh();
    },
  });
  const createFamily = useMutation({
    mutationFn: async (input: {
      sellerFamilyId: number;
      code: string;
      name: string;
      description?: string;
      key: string;
      label: string;
      values: Record<string, string>;
    }) => {
      let definition = attributes.data?.find((item) => item.key === input.key);
      if (definition && definition.scope !== "VARIANT")
        throw new Error(
          `The key ${input.key} is already used by a product-level attribute.`,
        );
      if (!definition) {
        definition = await api<AttributeDefinition>("/attributes", {
          method: "POST",
          body: JSON.stringify({
            key: input.key,
            displayName: input.label,
            description: `Variation choice for ${input.name}`,
            dataType: "SHORT_TEXT",
            scope: "VARIANT",
            isRequired: true,
            isSearchable: false,
            isFilterable: true,
            isComparable: true,
            isInheritable: false,
            displayOrder: 0,
            visibility: "PUBLIC",
            options: [],
          }),
        });
      }
      const current = product.data;
      if (!current) throw new Error("Product is not loaded.");
      await Promise.all(
        current.variants.map((variant) =>
          api(`/products/${id}/variants/${variant.id}`, {
            method: "PATCH",
            body: JSON.stringify({
              variationValues: {
                ...variant.variationValues,
                [input.key]: input.values[variant.id],
              },
            }),
          }),
        ),
      );
      await api("/product-families", {
        method: "POST",
        body: JSON.stringify({
          productId: id,
          sellerFamilyId: input.sellerFamilyId,
          code: input.code,
          name: input.name,
          description: input.description,
          variationAxes: [
            { attributeDefinitionId: definition.id, label: input.label },
          ],
          variantIds: current.variants.map((variant) => variant.id),
        }),
      });
    },
    onSuccess: async () => {
      setNotice("Product family created and all current variants attached.");
      await client.invalidateQueries({ queryKey: ["attributes"] });
      await refresh();
    },
  });
  const upload = useMutation({
    mutationFn: (files: FileList) => {
      const body = new FormData();
      for (const file of files) body.append("files", file);
      body.append("productId", id);
      body.append(
        "role",
        product.data?.imageAssignments.length ? "SECONDARY" : "MAIN",
      );
      body.append(
        "position",
        String(product.data?.imageAssignments.length ?? 0),
      );
      return api("/images/upload", { method: "POST", body });
    },
    onSuccess: refresh,
  });
  const removeImage = useMutation({
    mutationFn: (imageId: string) =>
      api(`/images/${imageId}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const updateImage = useMutation({
    mutationFn: ({
      assignmentId,
      input,
    }: {
      assignmentId: string;
      input: unknown;
    }) =>
      api(`/image-assignments/${assignmentId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: refresh,
  });
  const saveAttributes = useMutation({
    mutationFn: (input: unknown) =>
      api(`/products/${id}/attributes`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setNotice("Attributes saved.");
      await refresh();
    },
  });
  const saveVariantAttributes = useMutation({
    mutationFn: (input: unknown) =>
      api(`/variants/${attributeVariantId}/attributes`, {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: async () => {
      setNotice("Variant attributes saved.");
      await refresh();
    },
  });

  function submitProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const data = new FormData(event.currentTarget);
    update.mutate({
      productInput: {
        status: String(data.get("status")),
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
        euResponsiblePersonAddress: optional(
          data,
          "euResponsiblePersonAddress",
        ),
        euResponsiblePersonEmail: optional(data, "euResponsiblePersonEmail"),
        seoTitle: optional(data, "seoTitle"),
        seoDescription: optional(data, "seoDescription"),
        defaultLanguage: String(data.get("defaultLanguage")),
        taxClass: optional(data, "taxClass"),
        defaultVatRate: optional(data, "defaultVatRate"),
        defaultCurrency: String(data.get("defaultCurrency")),
        weight: optional(data, "weight"),
        weightUnit: optional(data, "weightUnit"),
        length: optional(data, "length"),
        width: optional(data, "width"),
        height: optional(data, "height"),
        diameter: optional(data, "diameter"),
        dimensionUnit: optional(data, "dimensionUnit"),
      },
      familyInput: product.data?.family
        ? {
            sellerFamilyId: Number(data.get("sellerFamilyId")),
            code: String(data.get("familyCode")),
            name: String(data.get("familyName")),
            description: optional(data, "familyDescription") ?? null,
            status: String(data.get("familyStatus")),
          }
        : undefined,
    });
  }

  function submitVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    const data = new FormData(event.currentTarget);
    const familyAxes = product.data?.family?.variationAxes ?? [];
    const fallbackKey = optional(data, "variationKey");
    const fallbackValue = optional(data, "variationValue");
    const variationValues = familyAxes.length
      ? Object.fromEntries(
          familyAxes.map((axis) => [
            axis.key,
            String(data.get(`variation_${axis.key}`)).trim(),
          ]),
        )
      : fallbackKey && fallbackValue
        ? { [fallbackKey]: fallbackValue }
        : {};
    addVariant.mutate({
      sku: String(data.get("sku")),
      internalNumericId: Number(data.get("internalNumericId")),
      variantName: String(data.get("variantName")),
      status: "DRAFT",
      gtin: optional(data, "gtin"),
      basePrice: optional(data, "basePrice"),
      costPrice: optional(data, "costPrice"),
      currency: String(data.get("currency")),
      weight: optional(data, "variantWeight"),
      weightUnit: optional(data, "variantWeightUnit"),
      length: optional(data, "variantLength"),
      width: optional(data, "variantWidth"),
      height: optional(data, "variantHeight"),
      dimensionUnit: optional(data, "variantDimensionUnit"),
      isDefaultVariant: false,
      variationValues,
    });
  }

  function submitVariantUpdate(
    event: FormEvent<HTMLFormElement>,
    variant: Variant,
  ) {
    event.preventDefault();
    setNotice("");
    setAttributeError("");
    const data = new FormData(event.currentTarget);
    try {
      const familyAxes = product.data?.family?.variationAxes ?? [];
      const variationValues = familyAxes.length
        ? {
            ...variant.variationValues,
            ...Object.fromEntries(
              familyAxes.map((axis) => [
                axis.key,
                String(data.get(`variation_${axis.key}`)).trim(),
              ]),
            ),
          }
        : (JSON.parse(String(data.get("variationValues") || "{}")) as unknown);
      updateVariant.mutate({
        variantId: variant.id,
        input: {
          sku: String(data.get("sku")),
          internalNumericId: Number(data.get("internalNumericId")),
          variantName: String(data.get("variantName")),
          status: String(data.get("status")),
          gtin: optional(data, "gtin") ?? null,
          basePrice: optional(data, "basePrice") ?? null,
          costPrice: optional(data, "costPrice") ?? null,
          currency: String(data.get("currency")),
          weight: optional(data, "variantWeight") ?? null,
          weightUnit: optional(data, "variantWeightUnit") ?? null,
          length: optional(data, "variantLength") ?? null,
          width: optional(data, "variantWidth") ?? null,
          height: optional(data, "variantHeight") ?? null,
          dimensionUnit: optional(data, "variantDimensionUnit") ?? null,
          isDefaultVariant: data.get("isDefaultVariant") === "on",
          variationValues,
        },
      });
    } catch {
      setAttributeError("Variation values must be a valid JSON object.");
    }
  }

  function submitFamily(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const current = product.data;
    if (!current) return;
    createFamily.mutate({
      sellerFamilyId: Number(data.get("sellerFamilyId")),
      code: String(data.get("familyCode")),
      name: String(data.get("familyName")),
      description: optional(data, "familyDescription"),
      key: String(data.get("axisKey")),
      label: String(data.get("axisLabel")),
      values: Object.fromEntries(
        current.variants.map((variant) => [
          variant.id,
          String(data.get(`familyValue_${variant.id}`)).trim(),
        ]),
      ),
    });
  }

  function submitAttributes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttributeError("");
    try {
      const data = new FormData(event.currentTarget);
      const values = productAttributes.flatMap((definition) => {
        const value = parseAttributeValue(data.get(definition.id), definition);
        return value === undefined
          ? []
          : [{ definitionId: definition.id, locale: "", value }];
      });
      saveAttributes.mutate({ values });
    } catch {
      setAttributeError("One of the JSON attribute values is invalid.");
    }
  }

  function submitVariantAttributes(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttributeError("");
    try {
      const data = new FormData(event.currentTarget);
      const values = variantAttributes.flatMap((definition) => {
        const value = parseAttributeValue(data.get(definition.id), definition);
        return value === undefined
          ? []
          : [{ definitionId: definition.id, locale: "", value }];
      });
      saveVariantAttributes.mutate({ values });
    } catch {
      setAttributeError("One of the JSON attribute values is invalid.");
    }
  }

  if (product.isLoading)
    return <div className="loading-panel">Loading product…</div>;
  if (product.isError || !product.data)
    return (
      <Card className="empty-state">
        <WarningCircle size={30} />
        <h2>Product could not be loaded</h2>
        <p>{errorMessage(product.error)}</p>
        <Button asChild variant="secondary">
          <Link to="/products">Back to products</Link>
        </Button>
      </Card>
    );

  const item = product.data;
  const editingVariant =
    item.variants.find((variant) => variant.id === editingVariantId) ??
    item.variants[0];
  const attributeVariant = item.variants.find(
    (variant) => variant.id === attributeVariantId,
  );
  const variantValuesByDefinition = new Map(
    attributeVariant?.attributeValues?.map((value) => [
      value.definitionId,
      value.value,
    ]) ?? [],
  );

  return (
    <div className="editor-page">
      <header className="editor-header">
        <div className="editor-heading">
          <Button asChild variant="ghost" size="icon">
            <Link to="/products" aria-label="Back to products">
              <ArrowLeft size={18} />
            </Link>
          </Button>
          <div>
            <span>{item.family ? "Family product" : "Standalone product"}</span>
            <h1>{item.publicName}</h1>
            <p>
              {item.variants.length} sellable SKU
              {item.variants.length === 1 ? "" : "s"} · {item.slug}
            </p>
          </div>
        </div>
        <div className="editor-actions">
          {item.family && (
            <Button asChild variant="secondary">
              <Link to={`/products/new?familyId=${item.family.id}`}>
                <Plus size={15} /> Create another variation
              </Link>
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => {
              if (window.confirm("Archive this product?")) archive.mutate();
            }}
            disabled={archive.isPending}
          >
            <Trash size={15} /> Archive
          </Button>
          <Button
            type="submit"
            form="product-editor-form"
            disabled={update.isPending}
          >
            <FloppyDisk size={16} />
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </header>

      <div className="editor-layout">
        <aside className="editor-nav" aria-label="Product editor sections">
          {sections.map(({ id: sectionId, label, icon: Icon }) => (
            <a key={sectionId} href={`#${sectionId}`}>
              <Icon size={16} />
              <span>{label}</span>
            </a>
          ))}
          <div className="editor-nav-note">
            <Info size={15} />
            <span>
              Helper text explains the source of truth. Offer-only fields remain
              in each channel draft.
            </span>
          </div>
        </aside>

        <main className="editor-content">
          {notice && <p className="success-alert editor-notice">{notice}</p>}
          <form id="product-editor-form" onSubmit={submitProduct}>
            <section className="editor-section" id="identity">
              <EditorSectionHeading
                title="Identity"
                description="Canonical names, classification, lifecycle, and URL identity."
                aside={
                  <Badge
                    tone={item.status === "ACTIVE" ? "success" : "neutral"}
                  >
                    {item.status}
                  </Badge>
                }
              />
              <div className="editor-fields two-up">
                <ProductEditorField
                  name="publicName"
                  label="Public product name"
                  help="Customer-facing title shared with connected channels. Example: Medical scrub set Lia, premium cotton."
                >
                  <Input
                    id="publicName"
                    name="publicName"
                    defaultValue={item.publicName}
                    placeholder="Medical scrub set Lia, premium cotton"
                    aria-describedby="publicName-help"
                    required
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="internalName"
                  label="Internal name"
                  help="Searchable team name that may include collection or supplier codes. Example: Lia scrub set AW26."
                >
                  <Input
                    id="internalName"
                    name="internalName"
                    defaultValue={item.internalName}
                    placeholder="Lia scrub set AW26"
                    aria-describedby="internalName-help"
                    required
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="shortName"
                  label="Short name"
                  optional
                  help="Compact label for exports and narrow screens. Example: Lia scrub set."
                >
                  <Input
                    id="shortName"
                    name="shortName"
                    defaultValue={item.shortName ?? ""}
                    placeholder="Lia scrub set"
                    aria-describedby="shortName-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="slug"
                  label="URL slug"
                  help="Stable lowercase URL segment. Example: medical-scrub-set-lia."
                >
                  <Input
                    id="slug"
                    name="slug"
                    defaultValue={item.slug}
                    placeholder="medical-scrub-set-lia"
                    aria-describedby="slug-help"
                    pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                    required
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="status"
                  label="Catalog status"
                  help="Draft is editable; Ready passed internal preparation; Active may be sent to connected channels."
                >
                  <select
                    id="status"
                    className="select-control"
                    name="status"
                    defaultValue={item.status}
                    aria-describedby="status-help"
                  >
                    <option value="DRAFT">Draft</option>
                    <option value="READY">Ready</option>
                    <option value="ACTIVE">Active</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                </ProductEditorField>
                <ProductEditorField
                  name="categoryId"
                  label="Internal category"
                  optional
                  help="Canonical workspace category. eMAG category mapping is kept in the eMAG listing draft."
                >
                  <select
                    id="categoryId"
                    className="select-control"
                    name="categoryId"
                    defaultValue={item.categoryId ?? ""}
                    aria-describedby="categoryId-help"
                  >
                    <option value="">Choose a category</option>
                    {categories.data?.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </ProductEditorField>
                <ProductEditorField
                  name="brandId"
                  label="Brand"
                  optional
                  help="Brand printed on the product. Example: Lia Veselie."
                >
                  <select
                    id="brandId"
                    className="select-control"
                    name="brandId"
                    defaultValue={item.brandId ?? ""}
                    aria-describedby="brandId-help"
                  >
                    <option value="">Choose a brand</option>
                    {brands.data?.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </ProductEditorField>
              </div>
            </section>

            <section className="editor-section" id="content">
              <EditorSectionHeading
                title="Content"
                description="Reusable source copy for websites and marketplaces."
              />
              <div className="editor-fields">
                <ProductEditorField
                  name="shortDescription"
                  label="Short description"
                  optional
                  help="One or two factual sentences for cards and listing previews."
                >
                  <textarea
                    id="shortDescription"
                    className="select-control textarea-control"
                    name="shortDescription"
                    defaultValue={item.shortDescription ?? ""}
                    placeholder="Soft, breathable medical set with a comfortable classic fit."
                    aria-describedby="shortDescription-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="description"
                  label="Full description"
                  optional
                  help="Benefits, materials, fit, care, and package contents. Use short paragraphs and factual bullet points."
                >
                  <textarea
                    id="description"
                    className="select-control textarea-control tall"
                    name="description"
                    defaultValue={item.description ?? ""}
                    placeholder="Describe the product, material, fit, care instructions, and package contents…"
                    aria-describedby="description-help"
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
                    defaultValue={item.seoTitle ?? ""}
                    placeholder="Lia Burgundy Medical Scrub Set"
                    aria-describedby="seoTitle-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="seoDescription"
                  label="SEO description"
                  optional
                  help="Clear search snippet around 140–160 characters; avoid unnatural repetition."
                >
                  <Input
                    id="seoDescription"
                    name="seoDescription"
                    defaultValue={item.seoDescription ?? ""}
                    placeholder="Premium cotton medical scrub set with a comfortable classic fit…"
                    aria-describedby="seoDescription-help"
                  />
                </ProductEditorField>
              </div>
            </section>

            <section className="editor-section" id="compliance">
              <EditorSectionHeading
                title="Compliance"
                description="Manufacturer, GPSR contact, label, and product-safety information."
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
                    defaultValue={item.manufacturerName ?? ""}
                    placeholder="SC Aline Textile SRL"
                    aria-describedby="manufacturerName-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="manufacturerPartNumber"
                  label="Manufacturer part number"
                  optional
                  help="Manufacturer’s stable article code. Example: LIA-SCRUB-2026."
                >
                  <Input
                    id="manufacturerPartNumber"
                    name="manufacturerPartNumber"
                    defaultValue={item.manufacturerPartNumber ?? ""}
                    placeholder="LIA-SCRUB-2026"
                    aria-describedby="manufacturerPartNumber-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="manufacturerAddress"
                  label="Manufacturer address"
                  optional
                  help="Full postal address displayed in product-safety information."
                >
                  <Input
                    id="manufacturerAddress"
                    name="manufacturerAddress"
                    defaultValue={item.manufacturerAddress ?? ""}
                    placeholder="Street, number, city, postal code, country"
                    aria-describedby="manufacturerAddress-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="manufacturerEmail"
                  label="Manufacturer email"
                  optional
                  help="Public product-compliance contact. Example: compliance@aline.ro."
                >
                  <Input
                    id="manufacturerEmail"
                    type="email"
                    name="manufacturerEmail"
                    defaultValue={item.manufacturerEmail ?? ""}
                    placeholder="compliance@aline.ro"
                    aria-describedby="manufacturerEmail-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="euResponsiblePersonName"
                  label="EU responsible person"
                  optional
                  help="Required when the manufacturer is outside the EU; enter the legal representative’s name."
                >
                  <Input
                    id="euResponsiblePersonName"
                    name="euResponsiblePersonName"
                    defaultValue={item.euResponsiblePersonName ?? ""}
                    placeholder="EU representative legal name"
                    aria-describedby="euResponsiblePersonName-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="euResponsiblePersonEmail"
                  label="EU representative email"
                  optional
                  help="Public compliance email of the EU representative."
                >
                  <Input
                    id="euResponsiblePersonEmail"
                    type="email"
                    name="euResponsiblePersonEmail"
                    defaultValue={item.euResponsiblePersonEmail ?? ""}
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
                  help="Full EU postal address; leave empty when it does not apply."
                >
                  <Input
                    id="euResponsiblePersonAddress"
                    name="euResponsiblePersonAddress"
                    defaultValue={item.euResponsiblePersonAddress ?? ""}
                    placeholder="Street, number, city, postal code, EU country"
                    aria-describedby="euResponsiblePersonAddress-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="safetyInformation"
                  label="Safety information"
                  optional
                  help="Warnings and safe-use instructions. Example: Keep away from open flame; follow the care label."
                >
                  <textarea
                    id="safetyInformation"
                    className="select-control textarea-control"
                    name="safetyInformation"
                    defaultValue={item.safetyInformation ?? ""}
                    placeholder="Keep away from open flame. Follow the washing and care instructions."
                    aria-describedby="safetyInformation-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="gs1LabelDescription"
                  label="GS1 label description"
                  optional
                  help="Short factual text used for GS1 registration. Example: Women’s medical scrub set, cotton blend."
                >
                  <Input
                    id="gs1LabelDescription"
                    name="gs1LabelDescription"
                    defaultValue={item.gs1LabelDescription ?? ""}
                    placeholder="Women’s medical scrub set, cotton blend"
                    aria-describedby="gs1LabelDescription-help"
                  />
                </ProductEditorField>
              </div>
            </section>

            <section className="editor-section" id="commercial">
              <EditorSectionHeading
                title="Commercial and logistics"
                description="Product-level defaults inherited by variants and connected websites unless a SKU overrides them."
              />
              <div className="editor-fields three-up">
                <ProductEditorField
                  name="defaultLanguage"
                  label="Source language"
                  help="ISO language code for canonical content. Example: ro."
                >
                  <Input
                    id="defaultLanguage"
                    name="defaultLanguage"
                    defaultValue={item.defaultLanguage}
                    placeholder="ro"
                    aria-describedby="defaultLanguage-help"
                    required
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="defaultCurrency"
                  label="Currency"
                  help="Three-letter ISO price currency. Example: RON."
                >
                  <Input
                    id="defaultCurrency"
                    name="defaultCurrency"
                    defaultValue={item.defaultCurrency}
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
                  help="Percentage without the % sign. The eMAG VAT ID remains channel-specific."
                >
                  <Input
                    id="defaultVatRate"
                    name="defaultVatRate"
                    inputMode="decimal"
                    defaultValue={item.defaultVatRate ?? ""}
                    placeholder="19"
                    aria-describedby="defaultVatRate-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="taxClass"
                  label="Tax class"
                  optional
                  help="Internal tax rule when the VAT percentage alone is insufficient. Example: standard-goods."
                >
                  <Input
                    id="taxClass"
                    name="taxClass"
                    defaultValue={item.taxClass ?? ""}
                    placeholder="standard-goods"
                    aria-describedby="taxClass-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="weight"
                  label="Default packed weight"
                  optional
                  help="Shipping weight inherited by variants unless overridden. Example: 0.45 kg."
                >
                  <Input
                    id="weight"
                    name="weight"
                    inputMode="decimal"
                    defaultValue={item.weight ?? ""}
                    placeholder="0.45"
                    aria-describedby="weight-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="weightUnit"
                  label="Weight unit"
                  optional
                  help="Unit used by the weight field. Prefer kg or g consistently."
                >
                  <Input
                    id="weightUnit"
                    name="weightUnit"
                    defaultValue={item.weightUnit ?? "kg"}
                    placeholder="kg"
                    aria-describedby="weightUnit-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="length"
                  label="Default length"
                  optional
                  help="Longest packed side. Example: 30."
                >
                  <Input
                    id="length"
                    name="length"
                    inputMode="decimal"
                    defaultValue={item.length ?? ""}
                    placeholder="30"
                    aria-describedby="length-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="width"
                  label="Default width"
                  optional
                  help="Second packed side. Example: 20."
                >
                  <Input
                    id="width"
                    name="width"
                    inputMode="decimal"
                    defaultValue={item.width ?? ""}
                    placeholder="20"
                    aria-describedby="width-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="height"
                  label="Default height"
                  optional
                  help="Smallest packed side. Example: 4."
                >
                  <Input
                    id="height"
                    name="height"
                    inputMode="decimal"
                    defaultValue={item.height ?? ""}
                    placeholder="4"
                    aria-describedby="height-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="diameter"
                  label="Default diameter"
                  optional
                  help="Only for cylindrical packages; otherwise leave empty."
                >
                  <Input
                    id="diameter"
                    name="diameter"
                    inputMode="decimal"
                    defaultValue={item.diameter ?? ""}
                    placeholder="—"
                    aria-describedby="diameter-help"
                  />
                </ProductEditorField>
                <ProductEditorField
                  name="dimensionUnit"
                  label="Dimension unit"
                  optional
                  help="Unit shared by all dimension values. Prefer cm or mm."
                >
                  <Input
                    id="dimensionUnit"
                    name="dimensionUnit"
                    defaultValue={item.dimensionUnit ?? "cm"}
                    placeholder="cm"
                    aria-describedby="dimensionUnit-help"
                  />
                </ProductEditorField>
              </div>
            </section>

            {item.family && (
              <section className="editor-section" id="family">
                <EditorSectionHeading
                  title="Product family"
                  description="Shared variation structure for this product’s sellable SKUs."
                  aside={
                    <Badge
                      tone={
                        item.family.status === "ACTIVE" ? "success" : "neutral"
                      }
                    >
                      {item.family.status}
                    </Badge>
                  }
                />
                <div className="concept-note">
                  <Stack size={18} />
                  <div>
                    <strong>
                      {item.family.members.length} family member
                      {item.family.members.length === 1 ? "" : "s"}
                    </strong>
                    <p>
                      The product holds shared content; each member is a
                      sellable SKU; the axes below define the choices connecting
                      them.
                    </p>
                  </div>
                </div>
                <div className="editor-fields two-up">
                  <ProductEditorField
                    name="familyName"
                    label="Family name"
                    help="Shared customer-facing name without size or color values."
                  >
                    <Input
                      id="familyName"
                      name="familyName"
                      defaultValue={item.family.name}
                      placeholder="Lia medical scrub set"
                      aria-describedby="familyName-help"
                      required
                    />
                  </ProductEditorField>
                  <ProductEditorField
                    name="familyCode"
                    label="Family code"
                    help="Stable internal code shared by all family variants."
                  >
                    <Input
                      id="familyCode"
                      name="familyCode"
                      defaultValue={item.family.code}
                      placeholder="LIA-SCRUB-SET"
                      aria-describedby="familyCode-help"
                      pattern="[A-Za-z0-9._-]+"
                      required
                    />
                  </ProductEditorField>
                  <ProductEditorField
                    name="sellerFamilyId"
                    label="Seller family ID"
                    help="Numeric ID sent unchanged on every separate eMAG product in this family."
                  >
                    <Input
                      id="sellerFamilyId"
                      name="sellerFamilyId"
                      type="number"
                      min={1}
                      max={2147483647}
                      defaultValue={item.family.sellerFamilyId ?? ""}
                      placeholder="120"
                      aria-describedby="sellerFamilyId-help"
                      required
                    />
                  </ProductEditorField>
                  <ProductEditorField
                    name="familyStatus"
                    label="Family status"
                    help="Keep Draft while variants are incomplete; mark Ready or Active only after verification."
                  >
                    <select
                      id="familyStatus"
                      className="select-control"
                      name="familyStatus"
                      defaultValue={item.family.status}
                      aria-describedby="familyStatus-help"
                    >
                      <option value="DRAFT">Draft</option>
                      <option value="READY">Ready</option>
                      <option value="ACTIVE">Active</option>
                      <option value="ARCHIVED">Archived</option>
                    </select>
                  </ProductEditorField>
                  <ProductEditorField
                    name="familyDescription"
                    label="Family note"
                    optional
                    help="Internal note describing what belongs to the family; not the sales description."
                  >
                    <Input
                      id="familyDescription"
                      name="familyDescription"
                      defaultValue={item.family.description ?? ""}
                      placeholder="Same cut and material; differs by size and color"
                      aria-describedby="familyDescription-help"
                    />
                  </ProductEditorField>
                </div>
                <div className="family-axis-summary">
                  <span>Variation choices</span>
                  {item.family.variationAxes.map((axis) => (
                    <strong key={axis.key}>
                      {axis.label}
                      <small>{axis.key}</small>
                    </strong>
                  ))}
                </div>
              </section>
            )}

            {update.error && (
              <p className="form-alert editor-error" role="alert">
                {errorMessage(update.error)}
              </p>
            )}
            <div className="editor-footer">
              <span>
                Save updates the canonical product
                {item.family ? " and its family metadata" : ""}. Channel offer
                data is not overwritten.
              </span>
              <Button type="submit" disabled={update.isPending}>
                <FloppyDisk size={16} />
                {update.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>

          {!item.family && (
            <section className="editor-section" id="family">
              <EditorSectionHeading
                title="Create product family"
                description="Make this sellable product the first size or color in a new family."
              />
              <form className="form-stack" onSubmit={submitFamily}>
                <div className="editor-fields three-up">
                  <ProductEditorField
                    name="newFamilyName"
                    label="Family name"
                    help="Shared product name without option values. Example: Lia medical scrub set."
                  >
                    <Input
                      id="newFamilyName"
                      name="familyName"
                      placeholder="Lia medical scrub set"
                      aria-describedby="newFamilyName-help"
                      required
                    />
                  </ProductEditorField>
                  <ProductEditorField
                    name="newFamilyCode"
                    label="Family code"
                    help="Stable code shared by all variants. Example: LIA-SCRUB-SET."
                  >
                    <Input
                      id="newFamilyCode"
                      name="familyCode"
                      placeholder="LIA-SCRUB-SET"
                      aria-describedby="newFamilyCode-help"
                      pattern="[A-Za-z0-9._-]+"
                      required
                    />
                  </ProductEditorField>
                  <ProductEditorField
                    name="newSellerFamilyId"
                    label="Seller family ID"
                    help="Stable number sent to eMAG for every product in the family. Example: 120."
                  >
                    <Input
                      id="newSellerFamilyId"
                      name="sellerFamilyId"
                      type="number"
                      min={1}
                      max={2147483647}
                      placeholder="120"
                      aria-describedby="newSellerFamilyId-help"
                      required
                    />
                  </ProductEditorField>
                  <ProductEditorField
                    name="axisLabel"
                    label="Choice label"
                    help="Customer-facing choice name. Example: Size or Color."
                  >
                    <Input
                      id="axisLabel"
                      name="axisLabel"
                      placeholder="Size"
                      aria-describedby="axisLabel-help"
                      required
                    />
                  </ProductEditorField>
                  <ProductEditorField
                    name="axisKey"
                    label="Attribute key"
                    help="Stable lowercase machine key. Example: size or color."
                  >
                    <Input
                      id="axisKey"
                      name="axisKey"
                      placeholder="size"
                      aria-describedby="axisKey-help"
                      pattern="[a-z][a-z0-9_]*"
                      required
                    />
                  </ProductEditorField>
                </div>
                <div className="family-draft-values">
                  <h3>Value for each current SKU</h3>
                  <p>Every variant must have a unique value for this choice.</p>
                  {item.variants.map((variant) => (
                    <ProductEditorField
                      key={variant.id}
                      name={`familyValue_${variant.id}`}
                      label={`${variant.sku} · ${variant.variantName}`}
                      help={`The ${variant.sku} value for the choice above. Example: XL.`}
                    >
                      <Input
                        id={`familyValue_${variant.id}`}
                        name={`familyValue_${variant.id}`}
                        defaultValue={
                          variant.variationValues.size ??
                          variant.variationValues.color ??
                          ""
                        }
                        placeholder="XL"
                        aria-describedby={`familyValue_${variant.id}-help`}
                        required
                      />
                    </ProductEditorField>
                  ))}
                </div>
                <ProductEditorField
                  name="newFamilyDescription"
                  label="Family note"
                  optional
                  help="Internal explanation of what belongs to this family."
                >
                  <Input
                    id="newFamilyDescription"
                    name="familyDescription"
                    placeholder="Same cut and material; differs by size"
                    aria-describedby="newFamilyDescription-help"
                  />
                </ProductEditorField>
                {createFamily.error && (
                  <p className="form-alert">
                    {errorMessage(createFamily.error)}
                  </p>
                )}
                <Button type="submit" disabled={createFamily.isPending}>
                  <Stack size={16} />
                  {createFamily.isPending
                    ? "Creating family…"
                    : "Create and attach family"}
                </Button>
              </form>
            </section>
          )}

          <section className="editor-section" id="variants">
            <EditorSectionHeading
              title="Sellable identity"
              description="This product owns its SKU, barcode, price, measurements, and family-choice values."
              aside={
                <Badge
                  tone={item.variants.length === 1 ? "success" : "warning"}
                >
                  {item.variants.length} SKU
                  {item.variants.length === 1 ? "" : "s"}
                </Badge>
              }
            />
            {item.variants.length > 1 && (
              <div className="form-note">
                <WarningCircle size={16} />
                <span>
                  Legacy product detected with multiple SKUs. New products use
                  one SKU each; split these into separate family products before
                  eMAG publication.
                </span>
              </div>
            )}
            <div className="variant-workspace">
              <div className="variant-table">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Name and choices</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>GTIN</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {item.variants.map((variant) => (
                      <TableRow key={variant.id}>
                        <TableCell>
                          <strong>{variant.sku}</strong>
                          {variant.isDefaultVariant && (
                            <small className="block text-muted">Default</small>
                          )}
                        </TableCell>
                        <TableCell>
                          {variant.variantName}
                          <small className="block text-muted">
                            {Object.entries(variant.variationValues)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(" · ") || "No variation choices"}
                          </small>
                        </TableCell>
                        <TableCell>
                          {variant.basePrice
                            ? `${variant.basePrice} ${variant.currency}`
                            : "Not set"}
                        </TableCell>
                        <TableCell>{variant.gtin ?? "Not set"}</TableCell>
                        <TableCell>
                          <div className="table-actions">
                            <Button
                              type="button"
                              aria-label={`Edit ${variant.sku}`}
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditingVariantId(variant.id)}
                            >
                              <PencilSimple size={14} />
                            </Button>
                            <Button
                              type="button"
                              aria-label={`Archive ${variant.sku}`}
                              size="icon"
                              variant="ghost"
                              disabled={
                                item.variants.length === 1 ||
                                archiveVariant.isPending
                              }
                              onClick={() => {
                                if (window.confirm(`Archive ${variant.sku}?`))
                                  archiveVariant.mutate(variant.id);
                              }}
                            >
                              <Trash size={14} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {editingVariant ? (
                <form
                  key={editingVariant.id}
                  className="variant-editor"
                  onSubmit={(event) =>
                    submitVariantUpdate(event, editingVariant)
                  }
                >
                  <div className="variant-editor-heading">
                    <div>
                      <h3>Edit variant</h3>
                      <p>{editingVariant.sku}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingVariantId("")}
                    >
                      Cancel
                    </Button>
                  </div>
                  <div className="editor-fields two-up">
                    <ProductEditorField
                      name="editSku"
                      label="SKU"
                      help="Unique stock code. Example: CMD-VISINIU-XL."
                    >
                      <Input
                        id="editSku"
                        name="sku"
                        defaultValue={editingVariant.sku}
                        placeholder="CMD-VISINIU-XL"
                        aria-describedby="editSku-help"
                        required
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editNumericId"
                      label="Seller numeric ID"
                      help="Stable numeric marketplace identifier; do not reuse it for another SKU."
                    >
                      <Input
                        id="editNumericId"
                        name="internalNumericId"
                        type="number"
                        min={1}
                        defaultValue={editingVariant.internalNumericId}
                        aria-describedby="editNumericId-help"
                        required
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editVariantName"
                      label="Variant name"
                      help="Readable choice combination. Example: Burgundy / XL."
                    >
                      <Input
                        id="editVariantName"
                        name="variantName"
                        defaultValue={editingVariant.variantName}
                        placeholder="Burgundy / XL"
                        aria-describedby="editVariantName-help"
                        required
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editStatus"
                      label="Status"
                      help="Draft while incomplete; Active only when this SKU is ready for sale."
                    >
                      <select
                        id="editStatus"
                        className="select-control"
                        name="status"
                        defaultValue={editingVariant.status}
                        aria-describedby="editStatus-help"
                      >
                        <option value="DRAFT">Draft</option>
                        <option value="READY">Ready</option>
                        <option value="ACTIVE">Active</option>
                        <option value="ARCHIVED">Archived</option>
                      </select>
                    </ProductEditorField>
                    <ProductEditorField
                      name="editBasePrice"
                      label="Base sale price"
                      optional
                      help="Canonical price before channel-specific offer rules. Example: 159.00."
                    >
                      <Input
                        id="editBasePrice"
                        name="basePrice"
                        defaultValue={editingVariant.basePrice ?? ""}
                        placeholder="159.00"
                        aria-describedby="editBasePrice-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editCostPrice"
                      label="Cost price"
                      optional
                      help="Internal acquisition or production cost; never published."
                    >
                      <Input
                        id="editCostPrice"
                        name="costPrice"
                        defaultValue={editingVariant.costPrice ?? ""}
                        placeholder="72.50"
                        aria-describedby="editCostPrice-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editCurrency"
                      label="Currency"
                      help="Three-letter ISO code. Example: RON."
                    >
                      <Input
                        id="editCurrency"
                        name="currency"
                        defaultValue={editingVariant.currency}
                        placeholder="RON"
                        aria-describedby="editCurrency-help"
                        maxLength={3}
                        required
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editGtin"
                      label="GTIN / EAN"
                      optional
                      help="Valid GS1 barcode including its check digit. Leave empty until assigned."
                    >
                      <Input
                        id="editGtin"
                        name="gtin"
                        defaultValue={editingVariant.gtin ?? ""}
                        placeholder="5941234123453"
                        aria-describedby="editGtin-help"
                      />
                    </ProductEditorField>
                  </div>
                  {item.family?.variationAxes.length ? (
                    <div className="editor-fields two-up">
                      {item.family.variationAxes.map((axis) => (
                        <ProductEditorField
                          key={axis.key}
                          name={`edit-${axis.key}`}
                          label={axis.label}
                          help={`Family choice stored under ${axis.key}. Example: XL or Burgundy.`}
                        >
                          <Input
                            id={`edit-${axis.key}`}
                            name={`variation_${axis.key}`}
                            defaultValue={
                              editingVariant.variationValues[axis.key] ?? ""
                            }
                            placeholder={
                              axis.key === "color" ? "Burgundy" : "XL"
                            }
                            aria-describedby={`edit-${axis.key}-help`}
                            required
                          />
                        </ProductEditorField>
                      ))}
                    </div>
                  ) : (
                    <ProductEditorField
                      name="editVariationValues"
                      label="Variation values (JSON)"
                      optional
                      help={
                        'Advanced format for a product without a family. Example: {"size":"XL"}.'
                      }
                    >
                      <textarea
                        id="editVariationValues"
                        className="select-control textarea-control"
                        name="variationValues"
                        defaultValue={JSON.stringify(
                          editingVariant.variationValues,
                          null,
                          2,
                        )}
                        aria-describedby="editVariationValues-help"
                      />
                    </ProductEditorField>
                  )}
                  <div className="editor-fields three-up">
                    <ProductEditorField
                      name="editVariantWeight"
                      label="Packed weight"
                      optional
                      help="SKU override; leave empty to use the product default."
                    >
                      <Input
                        id="editVariantWeight"
                        name="variantWeight"
                        defaultValue={editingVariant.weight ?? ""}
                        placeholder="0.45"
                        aria-describedby="editVariantWeight-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editVariantWeightUnit"
                      label="Weight unit"
                      optional
                      help="Unit for this SKU’s weight. Example: kg."
                    >
                      <Input
                        id="editVariantWeightUnit"
                        name="variantWeightUnit"
                        defaultValue={
                          editingVariant.weightUnit ?? item.weightUnit ?? "kg"
                        }
                        placeholder="kg"
                        aria-describedby="editVariantWeightUnit-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editVariantDimensionUnit"
                      label="Dimension unit"
                      optional
                      help="Shared unit for the SKU dimensions. Example: cm."
                    >
                      <Input
                        id="editVariantDimensionUnit"
                        name="variantDimensionUnit"
                        defaultValue={
                          editingVariant.dimensionUnit ??
                          item.dimensionUnit ??
                          "cm"
                        }
                        placeholder="cm"
                        aria-describedby="editVariantDimensionUnit-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editVariantLength"
                      label="Length"
                      optional
                      help="Longest packed side for this SKU."
                    >
                      <Input
                        id="editVariantLength"
                        name="variantLength"
                        defaultValue={editingVariant.length ?? ""}
                        placeholder="30"
                        aria-describedby="editVariantLength-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editVariantWidth"
                      label="Width"
                      optional
                      help="Second packed side for this SKU."
                    >
                      <Input
                        id="editVariantWidth"
                        name="variantWidth"
                        defaultValue={editingVariant.width ?? ""}
                        placeholder="20"
                        aria-describedby="editVariantWidth-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="editVariantHeight"
                      label="Height"
                      optional
                      help="Smallest packed side for this SKU."
                    >
                      <Input
                        id="editVariantHeight"
                        name="variantHeight"
                        defaultValue={editingVariant.height ?? ""}
                        placeholder="4"
                        aria-describedby="editVariantHeight-help"
                      />
                    </ProductEditorField>
                  </div>
                  <label className="inline-check">
                    <input
                      type="checkbox"
                      name="isDefaultVariant"
                      defaultChecked={editingVariant.isDefaultVariant}
                    />{" "}
                    Use as the default variant shown first
                  </label>
                  {(updateVariant.error || attributeError) && (
                    <p className="form-alert">
                      {attributeError || errorMessage(updateVariant.error)}
                    </p>
                  )}
                  <Button type="submit" disabled={updateVariant.isPending}>
                    Save variant
                  </Button>
                </form>
              ) : (
                <form className="variant-editor" onSubmit={submitVariant}>
                  <div className="variant-editor-heading">
                    <div>
                      <h3>Add variant</h3>
                      <p>
                        Creates a sellable SKU
                        {item.family ? " and attaches it to this family" : ""}.
                      </p>
                    </div>
                    <Plus size={18} />
                  </div>
                  <div className="editor-fields two-up">
                    <ProductEditorField
                      name="newSku"
                      label="SKU"
                      help="Unique stock code. Example: CMD-VISINIU-L."
                    >
                      <Input
                        id="newSku"
                        name="sku"
                        placeholder="CMD-VISINIU-L"
                        aria-describedby="newSku-help"
                        required
                        pattern="[A-Za-z0-9._-]+"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newNumericId"
                      label="Seller numeric ID"
                      help="Unique positive number used by marketplace integrations."
                    >
                      <Input
                        id="newNumericId"
                        name="internalNumericId"
                        type="number"
                        min={1}
                        placeholder="297"
                        aria-describedby="newNumericId-help"
                        required
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newVariantName"
                      label="Variant name"
                      help="Readable choice combination. Example: Burgundy / L."
                    >
                      <Input
                        id="newVariantName"
                        name="variantName"
                        placeholder="Burgundy / L"
                        aria-describedby="newVariantName-help"
                        required
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newGtin"
                      label="GTIN / EAN"
                      optional
                      help="Valid GS1 barcode with check digit; leave empty until allocated."
                    >
                      <Input
                        id="newGtin"
                        name="gtin"
                        inputMode="numeric"
                        placeholder="5941234123453"
                        aria-describedby="newGtin-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newBasePrice"
                      label="Base sale price"
                      optional
                      help="Canonical selling price before channel-specific rules."
                    >
                      <Input
                        id="newBasePrice"
                        name="basePrice"
                        inputMode="decimal"
                        placeholder="159.00"
                        aria-describedby="newBasePrice-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newCostPrice"
                      label="Cost price"
                      optional
                      help="Internal acquisition or production cost; never published."
                    >
                      <Input
                        id="newCostPrice"
                        name="costPrice"
                        inputMode="decimal"
                        placeholder="72.50"
                        aria-describedby="newCostPrice-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newCurrency"
                      label="Currency"
                      help="Three-letter ISO code. Example: RON."
                    >
                      <Input
                        id="newCurrency"
                        name="currency"
                        defaultValue={item.defaultCurrency}
                        placeholder="RON"
                        aria-describedby="newCurrency-help"
                        maxLength={3}
                        required
                      />
                    </ProductEditorField>
                  </div>
                  {item.family?.variationAxes.length ? (
                    <div className="editor-fields two-up">
                      {item.family.variationAxes.map((axis) => (
                        <ProductEditorField
                          key={axis.key}
                          name={`new-${axis.key}`}
                          label={axis.label}
                          help={`Required family choice stored as ${axis.key}. Each combination must be unique.`}
                        >
                          <Input
                            id={`new-${axis.key}`}
                            name={`variation_${axis.key}`}
                            placeholder={
                              axis.key === "color" ? "Burgundy" : "L"
                            }
                            aria-describedby={`new-${axis.key}-help`}
                            required
                          />
                        </ProductEditorField>
                      ))}
                    </div>
                  ) : (
                    <div className="editor-fields two-up">
                      <ProductEditorField
                        name="variationKey"
                        label="Variation key"
                        optional
                        help="Only for a product without a family. Example: size."
                      >
                        <Input
                          id="variationKey"
                          name="variationKey"
                          placeholder="size"
                          aria-describedby="variationKey-help"
                        />
                      </ProductEditorField>
                      <ProductEditorField
                        name="variationValue"
                        label="Variation value"
                        optional
                        help="Value matching the key. Example: L."
                      >
                        <Input
                          id="variationValue"
                          name="variationValue"
                          placeholder="L"
                          aria-describedby="variationValue-help"
                        />
                      </ProductEditorField>
                    </div>
                  )}
                  <div className="editor-fields three-up">
                    <ProductEditorField
                      name="newVariantWeight"
                      label="Packed weight"
                      optional
                      help="SKU override; leave empty to inherit the product default."
                    >
                      <Input
                        id="newVariantWeight"
                        name="variantWeight"
                        placeholder="0.45"
                        aria-describedby="newVariantWeight-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newVariantWeightUnit"
                      label="Weight unit"
                      optional
                      help="Unit for this SKU’s weight. Example: kg."
                    >
                      <Input
                        id="newVariantWeightUnit"
                        name="variantWeightUnit"
                        defaultValue={item.weightUnit ?? "kg"}
                        placeholder="kg"
                        aria-describedby="newVariantWeightUnit-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newVariantDimensionUnit"
                      label="Dimension unit"
                      optional
                      help="Shared unit for the SKU dimensions. Example: cm."
                    >
                      <Input
                        id="newVariantDimensionUnit"
                        name="variantDimensionUnit"
                        defaultValue={item.dimensionUnit ?? "cm"}
                        placeholder="cm"
                        aria-describedby="newVariantDimensionUnit-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newVariantLength"
                      label="Length"
                      optional
                      help="Longest packed side for this SKU."
                    >
                      <Input
                        id="newVariantLength"
                        name="variantLength"
                        placeholder="30"
                        aria-describedby="newVariantLength-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newVariantWidth"
                      label="Width"
                      optional
                      help="Second packed side for this SKU."
                    >
                      <Input
                        id="newVariantWidth"
                        name="variantWidth"
                        placeholder="20"
                        aria-describedby="newVariantWidth-help"
                      />
                    </ProductEditorField>
                    <ProductEditorField
                      name="newVariantHeight"
                      label="Height"
                      optional
                      help="Smallest packed side for this SKU."
                    >
                      <Input
                        id="newVariantHeight"
                        name="variantHeight"
                        placeholder="4"
                        aria-describedby="newVariantHeight-help"
                      />
                    </ProductEditorField>
                  </div>
                  {addVariant.error && (
                    <p className="form-alert">
                      {errorMessage(addVariant.error)}
                    </p>
                  )}
                  <Button type="submit" disabled={addVariant.isPending}>
                    <Plus size={15} />
                    {addVariant.isPending ? "Creating…" : "Create variant"}
                  </Button>
                </form>
              )}
            </div>
          </section>

          <section className="editor-section" id="media">
            <EditorSectionHeading
              title="Images"
              description="Upload originals; optimized derivatives are generated automatically. The first upload becomes the main image."
              aside={
                <label className="button-file">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    multiple
                    onChange={(event) => {
                      if (event.target.files?.length)
                        upload.mutate(event.target.files);
                    }}
                  />
                  {upload.isPending ? "Uploading…" : "Upload images"}
                </label>
              }
            />
            {upload.error && (
              <p className="form-alert">{errorMessage(upload.error)}</p>
            )}
            <div className="image-grid">
              {item.imageAssignments.map((assignment) => (
                <figure className="image-card" key={assignment.id}>
                  <div>
                    {assignment.image.thumbnailUrl ||
                    assignment.image.publicUrl ? (
                      <img
                        src={
                          assignment.image.thumbnailUrl ??
                          assignment.image.publicUrl
                        }
                        alt={assignment.altText ?? item.publicName}
                      />
                    ) : (
                      <ImageIcon size={28} />
                    )}
                  </div>
                  <figcaption>
                    <span>
                      <strong>{assignment.role}</strong>
                      <small>{assignment.image.originalFileName}</small>
                    </span>
                    <div className="table-actions">
                      {assignment.role !== "MAIN" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            updateImage.mutate({
                              assignmentId: assignment.id,
                              input: { role: "MAIN" },
                            })
                          }
                        >
                          Main
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Delete image"
                        onClick={() => {
                          if (window.confirm("Delete this image?"))
                            removeImage.mutate(assignment.image.id);
                        }}
                      >
                        <Trash size={14} />
                      </Button>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
            {!item.imageAssignments.length && (
              <div className="mini-empty">
                <ImageIcon size={28} />
                <span>
                  No images uploaded yet. Use clear product photos on a neutral
                  background.
                </span>
              </div>
            )}
          </section>

          <section className="editor-section" id="attributes">
            <EditorSectionHeading
              title="Custom attributes"
              description="Typed catalog facts used by category rules, filters, comparisons, and channel mappings."
            />
            {productAttributes.length ? (
              <form className="form-stack" onSubmit={submitAttributes}>
                <div className="editor-fields two-up">
                  {productAttributes.map((definition) => (
                    <ProductEditorField
                      key={definition.id}
                      name={`attribute-${definition.id}`}
                      label={definition.displayName}
                      optional={!definition.isRequired}
                      help={attributeHelp(definition)}
                    >
                      {definition.dataType === "BOOLEAN" ? (
                        <select
                          id={`attribute-${definition.id}`}
                          className="select-control"
                          name={definition.id}
                          defaultValue={String(
                            valuesByDefinition.get(definition.id) ?? "",
                          )}
                          aria-describedby={`attribute-${definition.id}-help`}
                          required={definition.isRequired}
                        >
                          <option value="">Not set</option>
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      ) : (
                        <Input
                          id={`attribute-${definition.id}`}
                          name={definition.id}
                          defaultValue={
                            typeof valuesByDefinition.get(definition.id) ===
                            "object"
                              ? JSON.stringify(
                                  valuesByDefinition.get(definition.id),
                                )
                              : String(
                                  valuesByDefinition.get(definition.id) ?? "",
                                )
                          }
                          aria-describedby={`attribute-${definition.id}-help`}
                          required={definition.isRequired}
                        />
                      )}
                    </ProductEditorField>
                  ))}
                </div>
                {(attributeError || saveAttributes.error) && (
                  <p className="form-alert">
                    {attributeError || errorMessage(saveAttributes.error)}
                  </p>
                )}
                <Button type="submit" disabled={saveAttributes.isPending}>
                  Save product attributes
                </Button>
              </form>
            ) : (
              <div className="mini-empty">
                <span>No product-level attributes are defined yet.</span>
                <Button asChild size="sm" variant="secondary">
                  <Link to="/attributes">Define attributes</Link>
                </Button>
              </div>
            )}

            <div className="variant-attributes-block">
              <h3>Variant attributes</h3>
              <p>
                Color, size, material, and other structured SKU-level facts.
              </p>
              {variantAttributes.length ? (
                <>
                  <ProductEditorField
                    name="attributeVariantId"
                    label="Variant"
                    help="Choose which SKU receives the values below."
                  >
                    <select
                      id="attributeVariantId"
                      className="select-control"
                      value={attributeVariantId}
                      onChange={(event) =>
                        setAttributeVariantId(event.target.value)
                      }
                      aria-describedby="attributeVariantId-help"
                    >
                      <option value="">Choose variant</option>
                      {item.variants.map((variant) => (
                        <option key={variant.id} value={variant.id}>
                          {variant.sku} · {variant.variantName}
                        </option>
                      ))}
                    </select>
                  </ProductEditorField>
                  {attributeVariant && (
                    <form
                      key={attributeVariant.id}
                      className="form-stack"
                      onSubmit={submitVariantAttributes}
                    >
                      <div className="editor-fields two-up">
                        {variantAttributes.map((definition) => (
                          <ProductEditorField
                            key={definition.id}
                            name={`variant-attribute-${definition.id}`}
                            label={definition.displayName}
                            optional={!definition.isRequired}
                            help={attributeHelp(definition)}
                          >
                            {definition.dataType === "BOOLEAN" ? (
                              <select
                                id={`variant-attribute-${definition.id}`}
                                className="select-control"
                                name={definition.id}
                                defaultValue={String(
                                  variantValuesByDefinition.get(
                                    definition.id,
                                  ) ?? "",
                                )}
                                aria-describedby={`variant-attribute-${definition.id}-help`}
                                required={definition.isRequired}
                              >
                                <option value="">Not set</option>
                                <option value="true">Yes</option>
                                <option value="false">No</option>
                              </select>
                            ) : (
                              <Input
                                id={`variant-attribute-${definition.id}`}
                                name={definition.id}
                                defaultValue={
                                  typeof variantValuesByDefinition.get(
                                    definition.id,
                                  ) === "object"
                                    ? JSON.stringify(
                                        variantValuesByDefinition.get(
                                          definition.id,
                                        ),
                                      )
                                    : String(
                                        variantValuesByDefinition.get(
                                          definition.id,
                                        ) ?? "",
                                      )
                                }
                                aria-describedby={`variant-attribute-${definition.id}-help`}
                                required={definition.isRequired}
                              />
                            )}
                          </ProductEditorField>
                        ))}
                      </div>
                      {(attributeError || saveVariantAttributes.error) && (
                        <p className="form-alert">
                          {attributeError ||
                            errorMessage(saveVariantAttributes.error)}
                        </p>
                      )}
                      <Button
                        type="submit"
                        disabled={saveVariantAttributes.isPending}
                      >
                        Save variant attributes
                      </Button>
                    </form>
                  )}
                </>
              ) : (
                <div className="mini-empty">
                  <span>No variant attributes are defined yet.</span>
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/attributes">Define attributes</Link>
                  </Button>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
