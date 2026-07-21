import type { ReactNode } from "react";

export function ProductEditorField({
  children,
  help,
  label,
  name,
  optional = false,
}: {
  children: ReactNode;
  help: string;
  label: string;
  name?: string;
  optional?: boolean;
}) {
  const helpId = name ? `${name}-help` : undefined;
  return (
    <div className="field editor-field">
      <div className="editor-field-label">
        <label htmlFor={name}>{label}</label>
        <span>{optional ? "Optional" : "Required"}</span>
      </div>
      {children}
      <small className="field-help" id={helpId}>
        {help}
      </small>
    </div>
  );
}

export function EditorSectionHeading({
  description,
  title,
  aside,
}: {
  description: string;
  title: string;
  aside?: ReactNode;
}) {
  return (
    <div className="editor-section-heading">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {aside}
    </div>
  );
}
