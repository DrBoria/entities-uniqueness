import * as React from "react";

const Panel = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div data-slot="panel" className={className} {...props} />
);

const PanelHeader = ({ className, ...props }: React.ComponentProps<"header">) => (
  <header data-slot="panel-header" className={className} {...props} />
);

const PANEL_VARIANTS = {
  solid: "bg-primary text-primary-foreground",
  outline: "border border-input",
  ghost: "hover:bg-accent",
};

export { Panel, PanelHeader, PANEL_VARIANTS };
