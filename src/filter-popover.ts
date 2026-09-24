/** 侧栏和批注中心共用的筛选弹出层。 */
import { getColorName, t } from "./i18n";
import type { AnnotationFilter, AnnotationSort } from "./annotation-query";
import type { Annotation } from "./types";

interface FilterHost {
  settings?: { language?: string };
}

export function mountFilterPopover(row: HTMLElement, annotations: Annotation[], filter: AnnotationFilter, plugin: FilterHost, onChange: (filter: AnnotationFilter) => void) {
  const popover = row.createDiv("aa-filter-popover");
  popover.createDiv({ cls: "aa-filter-label", text: t("ui.sort", plugin) });
  const sorts: Array<{ id: AnnotationSort; key: string }> = [
    { id: "position", key: "ui.sortPosition" },
    { id: "created", key: "ui.sortCreated" },
    { id: "updated", key: "ui.sortUpdated" }
  ];
  for (const sort of sorts) {
    const button = popover.createEl("button", {
      cls: "aa-filter-option",
      text: t(sort.key, plugin),
      attr: { type: "button", "aria-pressed": filter.sort === sort.id ? "true" : "false" }
    });
    if (filter.sort === sort.id)
      button.addClass("is-selected");
    button.onclick = (evt) => {
      evt.preventDefault();
      onChange({ ...filter, sort: sort.id });
    };
  }
  const colors = [...new Set(annotations.map((annotation) => annotation.color))];
  if (colors.length > 0) {
    popover.createDiv({ cls: "aa-filter-label", text: t("ui.filterColor", plugin) });
    const colorRow = popover.createDiv("aa-filter-colors");
    for (const color of colors) {
      const swatch = colorRow.createEl("button", {
        cls: "aa-filter-swatch",
        attr: {
          type: "button",
          "aria-label": getColorName(color, plugin) || color,
          "aria-pressed": filter.colors.includes(color) ? "true" : "false"
        }
      });
      swatch.style.setProperty("--aa-accent", color);
      if (filter.colors.includes(color))
        swatch.addClass("is-selected");
      swatch.onclick = (evt) => {
        evt.preventDefault();
        const selected = new Set(filter.colors);
        if (selected.has(color))
          selected.delete(color);
        else
          selected.add(color);
        onChange({ ...filter, colors: [...selected] });
      };
    }
  }
  const tags = [...new Set(annotations.flatMap((annotation) => annotation.tags ?? []))];
  if (tags.length > 0) {
    popover.createDiv({ cls: "aa-filter-label", text: t("ui.filterTag", plugin) });
    const tagRow = popover.createDiv("aa-filter-tags");
    for (const tag of tags) {
      const chip = tagRow.createEl("button", {
        cls: "aa-filter-chip",
        text: tag,
        attr: { type: "button", "aria-pressed": filter.tags.includes(tag) ? "true" : "false" }
      });
      if (filter.tags.includes(tag))
        chip.addClass("is-selected");
      chip.onclick = (evt) => {
        evt.preventDefault();
        const selected = new Set(filter.tags);
        if (selected.has(tag))
          selected.delete(tag);
        else
          selected.add(tag);
        onChange({ ...filter, tags: [...selected] });
      };
    }
  }
  mountFilterToggle(popover, filter, "notesOnly", t("ui.notesOnly", plugin), onChange);
  mountFilterToggle(popover, filter, "tagsOnly", t("ui.tagsOnly", plugin), onChange);
  return popover;
}

function mountFilterToggle(popover: HTMLElement, filter: AnnotationFilter, key: "notesOnly" | "tagsOnly", label: string, onChange: (filter: AnnotationFilter) => void) {
  const button = popover.createEl("button", {
    cls: "aa-filter-option",
    text: label,
    attr: { type: "button", "aria-pressed": filter[key] ? "true" : "false" }
  });
  if (filter[key])
    button.addClass("is-selected");
  button.onclick = (evt) => {
    evt.preventDefault();
    onChange({ ...filter, [key]: !filter[key] });
  };
}
