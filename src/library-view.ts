/** 跨文件的批注列表。只列出已有批注的路径，不是文件管理器。 */
import { ItemView, Platform, type WorkspaceLeaf } from "obsidian";
import { mountAnnotationCard } from "./annotation-card";
import {
  compareAnnotations,
  defaultAnnotationFilter,
  isFilterActive,
  isNote,
  matchesFilter,
  matchesKind,
  matchesQuery,
  type AnnotationFilter,
  type AnnotationKind
} from "./annotation-query";
import { mountFilterPopover } from "./filter-popover";
import { t } from "./i18n";
import type ArticleAnnotator from "./main";
import type { Annotation } from "./types";

export const VIEW_TYPE_LIBRARY = "article-annotator-library";

type PathKind = "all" | "folder" | "file";
type TimeRange = "all" | "today" | "week";

interface FolderNode {
  name: string;
  path: string;
  folders: FolderNode[];
  files: Array<{ name: string; path: string; count: number }>;
}

export class AnnotationLibraryView extends ItemView {
  plugin: ArticleAnnotator;
  query = "";
  kind: AnnotationKind = "all";
  filter: AnnotationFilter = defaultAnnotationFilter();
  filterOpen = false;
  searchTimer: number | null = null;
  pathKind: PathKind = "all";
  pathValue = "";
  timeRange: TimeRange = "all";

  constructor(leaf: WorkspaceLeaf, plugin: ArticleAnnotator) {
    super(leaf);
    this.plugin = plugin;
    this.icon = "library";
  }
  getViewType() {
    return VIEW_TYPE_LIBRARY;
  }
  getDisplayText() {
    return t("ui.libraryTitle", this.plugin);
  }
  async onOpen() {
    this.containerEl.addClass("aa-library");
    if (Platform.isMobile)
      this.containerEl.addClass("is-touch");
    const doc = this.containerEl.ownerDocument;
    this.registerDomEvent(doc, "pointerdown", (evt) => {
      if (!this.filterOpen)
        return;
      const target = evt.target;
      if (!(target instanceof Node))
        return;
      const popover = this.containerEl.querySelector(".aa-filter-popover");
      const button = this.containerEl.querySelector(".aa-filter-button");
      if (popover?.contains(target) || button?.contains(target))
        return;
      this.filterOpen = false;
      popover?.remove();
    });
    this.registerDomEvent(doc, "keydown", (evt) => {
      if (evt.key !== "Escape" || !this.filterOpen)
        return;
      this.filterOpen = false;
      this.containerEl.querySelector(".aa-filter-popover")?.remove();
    });
    this.render();
  }
  async onClose() {
    this.clearSearchTimer();
    await super.onClose();
  }
  clearSearchTimer() {
    if (this.searchTimer === null)
      return;
    this.containerEl.ownerDocument.defaultView?.clearTimeout(this.searchTimer);
    this.searchTimer = null;
  }
  scheduleSearch() {
    this.clearSearchTimer();
    const win = this.containerEl.ownerDocument.defaultView ?? window;
    this.searchTimer = win.setTimeout(() => {
      this.searchTimer = null;
      this.renderList();
    }, 300);
  }
  sourceAnnotations(): Annotation[] {
    return this.plugin.data.filter((annotation) => this.matchesPath(annotation) && this.matchesTime(annotation));
  }
  matchesPath(annotation: Annotation): boolean {
    if (this.pathKind === "all" || !this.pathValue)
      return true;
    if (this.pathKind === "file")
      return annotation.filePath === this.pathValue;
    return annotation.filePath === this.pathValue || annotation.filePath.startsWith(`${this.pathValue}/`);
  }
  matchesTime(annotation: Annotation): boolean {
    if (this.timeRange === "all")
      return true;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    if (this.timeRange === "week")
      start.setDate(start.getDate() - 6);
    return annotation.created >= start.getTime();
  }
  visibleAnnotations(): Annotation[] {
    return this.sourceAnnotations()
      .filter((annotation) => matchesKind(annotation, this.kind) && matchesQuery(annotation, this.query, true) && matchesFilter(annotation, this.filter))
      .sort((a, b) => compareAnnotations(a, b, this.filter.sort));
  }
  render() {
    const doc = this.containerEl.ownerDocument;
    const active = doc.activeElement;
    const searchWasFocused = active instanceof HTMLInputElement && active.classList.contains("aa-sidebar-search");
    const cursor = searchWasFocused ? active.selectionStart : null;
    const container = this.containerEl;
    container.empty();
    container.addClass("aa-library");
    if (Platform.isMobile)
      container.addClass("is-touch");
    const nav = container.createDiv("aa-library-nav");
    this.renderNav(nav);
    const main = container.createDiv("aa-library-main");
    const annotations = this.sourceAnnotations();
    this.renderSearch(main, annotations);
    this.renderTabs(main, annotations);
    const list = main.createDiv("aa-sidebar-list");
    this.fillList(list);
    if (searchWasFocused) {
      const input = container.querySelector(".aa-sidebar-search");
      if (input instanceof HTMLInputElement) {
        input.focus();
        if (cursor !== null)
          input.setSelectionRange(cursor, cursor);
      }
    }
  }
  renderList() {
    const list = this.containerEl.querySelector(".aa-library-main .aa-sidebar-list");
    if (!(list instanceof HTMLElement)) {
      this.render();
      return;
    }
    const scrollTop = list.scrollTop;
    list.empty();
    this.fillList(list);
    list.scrollTop = scrollTop;
  }
  renderNav(nav: HTMLElement) {
    const allBtn = nav.createEl("button", {
      cls: "aa-library-path",
      text: t("ui.allFiles", this.plugin),
      attr: { type: "button", "aria-pressed": this.pathKind === "all" ? "true" : "false" }
    });
    if (this.pathKind === "all")
      allBtn.addClass("is-selected");
    allBtn.onclick = () => {
      this.pathKind = "all";
      this.pathValue = "";
      this.render();
    };
    this.renderFolder(nav, buildTree(this.plugin.data), 0);
  }
  renderFolder(parent: HTMLElement, node: FolderNode, depth: number) {
    const folders = [...node.folders].sort((a, b) => a.name.localeCompare(b.name));
    for (const folder of folders) {
      const button = parent.createEl("button", {
        cls: "aa-library-path",
        text: folder.name,
        attr: { type: "button", "aria-pressed": this.pathKind === "folder" && this.pathValue === folder.path ? "true" : "false" }
      });
      button.style.setProperty("--aa-indent", `${12 + depth * 12}px`);
      if (this.pathKind === "folder" && this.pathValue === folder.path)
        button.addClass("is-selected");
      button.onclick = () => {
        this.pathKind = "folder";
        this.pathValue = folder.path;
        this.render();
      };
      this.renderFolder(parent, folder, depth + 1);
    }
    const files = [...node.files].sort((a, b) => a.name.localeCompare(b.name));
    for (const file of files) {
      const button = parent.createEl("button", {
        cls: "aa-library-path",
        text: `${file.name} ${file.count}`,
        attr: { type: "button", "aria-pressed": this.pathKind === "file" && this.pathValue === file.path ? "true" : "false" }
      });
      button.style.setProperty("--aa-indent", `${12 + depth * 12}px`);
      if (this.pathKind === "file" && this.pathValue === file.path)
        button.addClass("is-selected");
      button.onclick = () => {
        this.pathKind = "file";
        this.pathValue = file.path;
        this.render();
      };
    }
  }
  renderSearch(main: HTMLElement, annotations: Annotation[]) {
    const row = main.createDiv("aa-sidebar-search-row");
    const input = row.createEl("input", {
      cls: "aa-sidebar-search",
      attr: {
        type: "search",
        placeholder: t("ui.searchAnnotationsPlaceholder", this.plugin),
        autocomplete: "off",
        "aria-label": t("ui.searchAnnotationsPlaceholder", this.plugin)
      }
    });
    input.value = this.query;
    input.addEventListener("input", () => {
      this.query = input.value;
      this.scheduleSearch();
    });
    const filterBtn = row.createEl("button", {
      cls: "aa-filter-button",
      text: t("ui.filter", this.plugin),
      attr: { type: "button", "aria-expanded": this.filterOpen ? "true" : "false" }
    });
    if (isFilterActive(this.filter) || this.timeRange !== "all")
      filterBtn.addClass("is-active");
    filterBtn.onclick = (evt) => {
      evt.preventDefault();
      this.filterOpen = !this.filterOpen;
      this.render();
    };
    if (!this.filterOpen)
      return;
    const popover = mountFilterPopover(row, annotations, this.filter, this.plugin, (filter) => {
      this.filter = filter;
      this.render();
    });
    popover.createDiv({ cls: "aa-filter-label", text: t("ui.filterTime", this.plugin) });
    const ranges: Array<{ id: TimeRange; key: string }> = [
      { id: "all", key: "ui.timeAll" },
      { id: "today", key: "ui.timeToday" },
      { id: "week", key: "ui.timeWeek" }
    ];
    for (const range of ranges) {
      const button = popover.createEl("button", {
        cls: "aa-filter-option",
        text: t(range.key, this.plugin),
        attr: { type: "button", "aria-pressed": this.timeRange === range.id ? "true" : "false" }
      });
      if (this.timeRange === range.id)
        button.addClass("is-selected");
      button.onclick = (evt) => {
        evt.preventDefault();
        this.timeRange = range.id;
        this.render();
      };
    }
  }
  renderTabs(main: HTMLElement, annotations: Annotation[]) {
    const noteCount = annotations.filter((annotation) => isNote(annotation)).length;
    const tabs = main.createDiv("aa-sidebar-tabs");
    const options: Array<{ kind: AnnotationKind; label: string }> = [
      { kind: "all", label: t("ui.tabAll", this.plugin).replace("${n}", String(annotations.length)) },
      { kind: "note", label: t("ui.tabNotes", this.plugin).replace("${n}", String(noteCount)) },
      { kind: "highlight", label: t("ui.tabHighlights", this.plugin).replace("${n}", String(annotations.length - noteCount)) }
    ];
    for (const option of options) {
      const button = tabs.createEl("button", {
        text: option.label,
        attr: { type: "button", "aria-pressed": this.kind === option.kind ? "true" : "false" }
      });
      if (this.kind === option.kind)
        button.addClass("is-active");
      button.onclick = () => {
        this.kind = option.kind;
        this.render();
      };
    }
  }
  fillList(list: HTMLElement) {
    const allInScope = this.sourceAnnotations();
    const visible = this.visibleAnnotations();
    if (allInScope.length === 0 && !this.query.trim() && !isFilterActive(this.filter) && this.kind === "all" && this.timeRange === "all" && this.pathKind === "all") {
      list.createDiv("aa-sidebar-empty").createEl("p", { text: t("ui.emptyReading", this.plugin) });
      return;
    }
    if (visible.length === 0) {
      const emptyEl = list.createDiv("aa-sidebar-empty");
      if (this.query.trim()) {
        emptyEl.createEl("p", { text: t("ui.noResults", this.plugin) });
        return;
      }
      emptyEl.createEl("p", { text: t("ui.filterEmpty", this.plugin) });
      const clearBtn = emptyEl.createEl("button", {
        text: t("ui.clearFilters", this.plugin),
        attr: { type: "button" }
      });
      clearBtn.addClass("aa-clear-filters");
      clearBtn.onclick = () => {
        this.kind = "all";
        this.filter = defaultAnnotationFilter();
        this.timeRange = "all";
        this.pathKind = "all";
        this.pathValue = "";
        this.filterOpen = false;
        this.render();
      };
      return;
    }
    visible.forEach((annotation) => mountAnnotationCard(list, annotation, this.plugin, () => this.render()));
  }
}

function buildTree(annotations: readonly Annotation[]): FolderNode {
  const root: FolderNode = { name: "", path: "", folders: [], files: [] };
  const counts = new Map<string, number>();
  for (const annotation of annotations)
    counts.set(annotation.filePath, (counts.get(annotation.filePath) ?? 0) + 1);
  for (const [filePath, count] of counts) {
    const parts = filePath.split("/");
    const fileName = parts.pop() || filePath;
    let node = root;
    let path = "";
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      let child = node.folders.find((folder) => folder.name === part);
      if (!child) {
        child = { name: part, path, folders: [], files: [] };
        node.folders.push(child);
      }
      node = child;
    }
    node.files.push({ name: fileName, path: filePath, count });
  }
  return root;
}
