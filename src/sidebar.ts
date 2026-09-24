/** 右侧批注列表、分组和卡片上的编辑。 */
import { ItemView, Modal, Notice, TFile, type WorkspaceLeaf } from "obsidian";
import { formatTime, getAnnotationLocationLabel, normalizeAnnotation } from "./annotation-model";
import { chordLabel, getColorName, t } from "./i18n";
import type ArticleAnnotator from "./main";
import type { Annotation, HighlightGroup } from "./types";

export const VIEW_TYPE = "article-annotator-sidebar";

export class AnnotatorSidebarView extends ItemView {
  currentFile: TFile | null = null;
  plugin: ArticleAnnotator;
  selectedAnnotations = new Set<string>();
  isMultiSelectMode = false;
  editingId: string | null = null;
  constructor(leaf: WorkspaceLeaf, plugin: ArticleAnnotator) {
    super(leaf);
    this.plugin = plugin;
    this.icon = "pen-tool";
  }
  getViewType() {
    return VIEW_TYPE;
  }
  getDisplayText() {
    return t("pluginName", this.plugin);
  }
  async onOpen() {
    const container = this.containerEl;
    container.addClass("aa-sidebar");
    this.render();
  }
  update(file: TFile | null) {
    this.currentFile = file;
    this.render();
  }
  render() {
    const container = this.containerEl;
    container.empty();
    const header = container.createDiv("aa-sidebar-header");
    const titleEl = header.createEl("h3", { text: t("ui.sidebarTitle", this.plugin) });
    const closeBtn = header.createEl("button", {
      text: "\xD7",
      attr: { type: "button", "aria-label": t("ui.close", this.plugin) }
    });
    closeBtn.onclick = () => {
      this.plugin.app.workspace.detachLeavesOfType(VIEW_TYPE);
    };
    if (!this.currentFile) {
      const emptyEl = container.createDiv("aa-sidebar-empty");
      emptyEl.createEl("p", { text: t("notifications.openFileFirst", this.plugin) });
      return;
    }
    const annotations = this.plugin.getAnnotationsForFile(this.currentFile.path).filter((annotation) => annotation.anchor !== "file-missing");
    const stats = container.createDiv("aa-sidebar-stats");
    const highlightCount = annotations.filter((a) => a.type === "highlight").length;
    const noteCount = annotations.filter((a) => a.noteContent).length;
    const totalCount = annotations.length;
    const createStat = (label: string, value: number) => {
      const el = stats.createDiv("aa-stat");
      el.createEl("div", {
        text: String(value),
        cls: "aa-stat-value"
      });
      el.createEl("div", {
        text: label,
        cls: "aa-stat-label"
      });
    };
    createStat(t("ui.all", this.plugin), totalCount);
    createStat(t("ui.highlights", this.plugin), highlightCount);
    createStat(t("ui.notes", this.plugin), noteCount);
    const actions = container.createDiv("aa-sidebar-actions");
    const searchBtn = actions.createEl("button", { text: t("ui.search", this.plugin) });
    searchBtn.onclick = () => this.plugin.openSearchModal();
    const exportBtn = actions.createEl("button", { text: t("ui.export", this.plugin) });
    exportBtn.onclick = () => this.plugin.exportAnnotations();
    const clearBtn = actions.createEl("button", { text: t("ui.clear", this.plugin) });
    clearBtn.onclick = async () => {
      const count = annotations.length;
      if (count === 0)
        return;
      if (!confirm(t("notifications.clearFileConfirm", this.plugin).replace("${n}", String(count))))
        return;
      await this.plugin.clearFileAnnotations();
      this.render();
    };
    // 多选按钮
    const multiSelectBtn = actions.createEl("button", { text: t("ui.selectMultiple", this.plugin) });
    if (this.isMultiSelectMode) {
      multiSelectBtn.addClass("is-active");
    }
    multiSelectBtn.onclick = () => {
      this.isMultiSelectMode = !this.isMultiSelectMode;
      if (!this.isMultiSelectMode) {
        this.selectedAnnotations.clear();
      }
      this.render();
    };
    // 分组按钮（仅在多选模式下显示）
    if (this.isMultiSelectMode && this.selectedAnnotations.size > 0) {
      const groupBtn = actions.createEl("button", { text: t("ui.groupSelected", this.plugin) });
      groupBtn.onclick = () => this.showCreateGroupDialog();
    }
    // 取消选择按钮（仅在多选模式下显示）
    if (this.isMultiSelectMode) {
      const cancelBtn = actions.createEl("button", { text: t("ui.cancelSelection", this.plugin) });
      cancelBtn.onclick = () => {
        this.isMultiSelectMode = false;
        this.selectedAnnotations.clear();
        this.render();
      };
    }
    const list = container.createDiv("aa-sidebar-list");
    if (annotations.length === 0) {
      const emptyEl = list.createDiv("aa-sidebar-empty");
      emptyEl.style.cssText = "padding:24px;text-align:center;color:var(--text-muted);";
      emptyEl.createEl("p", {
        text: t("ui.emptyHint", this.plugin)
      });
      this.renderMissingFiles(list);
      return;
    }
    const sorted = [...annotations].sort((a, b) => {
      const ao = typeof a.order === "number" ? a.order : a.created;
      const bo = typeof b.order === "number" ? b.order : b.created;
      return bo - ao;
    });
    
    // 获取当前文件的分组
    const groups = this.plugin.getGroupsForFile(this.currentFile.path);
    
    // 按分组组织批注
    const groupedAnnotations = new Map<string, Annotation[]>();
    const ungroupedAnnotations: Annotation[] = [];
    
    // 初始化分组Map
    groups.forEach(group => {
      groupedAnnotations.set(group.id, []);
    });
    
    // 将批注分到对应分组
    sorted.forEach(annotation => {
      const bucket = annotation.groupId ? groupedAnnotations.get(annotation.groupId) : undefined;
      if (bucket) {
        bucket.push(annotation);
      } else {
        ungroupedAnnotations.push(annotation);
      }
    });
    
    // 渲染分组
    groups.forEach(group => {
      const groupAnnotations = groupedAnnotations.get(group.id) ?? [];
      if (groupAnnotations.length === 0) return;
      
      const groupContainer = list.createDiv("aa-group-container");
      
      // 分组头部
      const groupHeader = groupContainer.createDiv("aa-group-header");
      groupHeader.tabIndex = 0;
      
      const groupTitle = groupHeader.createDiv("aa-group-title");
      
      groupTitle.createEl("span", { 
        text: group.collapsed ? "▶" : "▼",
        cls: "aa-collapse-icon"
      });
      
      groupTitle.createEl("span", { text: group.name });
      
      groupHeader.createEl("span", { 
        text: t("ui.groupCount", this.plugin).replace("${n}", String(groupAnnotations.length)),
        cls: "aa-group-count"
      });
      
      // 分组操作按钮
      const groupActions = groupHeader.createDiv("aa-group-actions");
      
      const renameBtn = groupActions.createEl("button", {
        text: "✏️",
        attr: { type: "button", "aria-label": t("ui.renameGroup", this.plugin) }
      });
      renameBtn.onclick = (e) => {
        e.stopPropagation();
        this.showRenameGroupDialog(group);
      };
      
      const ungroupBtn = groupActions.createEl("button", {
        text: "📤",
        attr: { type: "button", "aria-label": t("ui.ungroup", this.plugin) }
      });
      ungroupBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(t("ui.ungroupConfirm", this.plugin).replace("${name}", group.name).replace("${n}", String(groupAnnotations.length)))) return;
        for (const annotation of groupAnnotations) {
          await this.plugin.removeAnnotationFromGroup(annotation.id);
        }
        await this.plugin.removeGroup(group.id);
        this.render();
      };
      
      // 点击或在标题上按 Enter / 空格折叠
      const toggleGroup = () => {
        group.collapsed = !group.collapsed;
        this.plugin.updateGroup(group.id, { collapsed: group.collapsed });
        this.render();
      };
      groupHeader.onclick = () => toggleGroup();
      groupHeader.addEventListener("keydown", (evt) => {
        if (evt.target !== groupHeader)
          return;
        if (evt.key !== "Enter" && evt.key !== " ")
          return;
        evt.preventDefault();
        toggleGroup();
      });
      
      // 分组内容（可折叠）
      if (!group.collapsed) {
        const groupContent = groupContainer.createDiv("aa-group-content");
        
        groupAnnotations.forEach(annotation => {
          this.renderAnnotationCard(groupContent, annotation);
        });
      }
      
      // 分组容器作为拖拽放置目标
      groupContainer.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        groupContainer.addClass("aa-group-drop-target");
      });
      
      groupContainer.addEventListener("dragleave", (ev) => {
        // 只有当真正离开容器时才移除样式
        const nextTarget = ev.relatedTarget;
        if (!(nextTarget instanceof Node) || !groupContainer.contains(nextTarget))
          groupContainer.removeClass("aa-group-drop-target");
      });
      
      groupContainer.addEventListener("drop", async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        groupContainer.removeClass("aa-group-drop-target");
        
        const annotationId = ev.dataTransfer?.getData("text/plain");
        if (!annotationId) return;
        
        // 将批注添加到该分组
        await this.plugin.addAnnotationToGroup(annotationId, group.id);
        this.render();
      });
    });
    
    // 渲染未分组的批注
    if (ungroupedAnnotations.length > 0) {
      if (groups.length > 0) {
        const separator = list.createDiv("aa-ungrouped-separator");
        separator.setText(t("ui.ungrouped", this.plugin));
      }
      
      ungroupedAnnotations.forEach(annotation => {
        this.renderAnnotationCard(list, annotation);
      });
    }
    this.renderMissingFiles(list);
  }
  anchorStatusText(anchor: Annotation["anchor"]): string {
    if (anchor === "ambiguous")
      return t("ui.anchorAmbiguous", this.plugin);
    if (anchor === "missing")
      return t("ui.anchorMissing", this.plugin);
    if (anchor === "file-missing")
      return t("ui.anchorFileMissing", this.plugin);
    return "";
  }
  renderMissingFiles(list: HTMLElement) {
    const missing = this.plugin.data.filter((annotation) => annotation.anchor === "file-missing");
    if (missing.length === 0)
      return;
    const separator = list.createDiv("aa-ungrouped-separator");
    separator.setText(t("ui.orphanHeading", this.plugin));
    missing.forEach((annotation) => {
      this.renderAnnotationCard(list, annotation);
    });
  }
  scrollToCard(annotationId: string) {
    const card = this.containerEl.querySelector(`.aa-card[data-annotation-id="${annotationId}"]`);
    if (!card)
      return;
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    this.containerEl.querySelectorAll(".aa-card.is-scroll-synced").forEach((el) => el.classList.remove("is-scroll-synced"));
    card.classList.add("is-scroll-synced");
    setTimeout(() => card.classList.remove("is-scroll-synced"), 1600);
  }
  renderAnnotationCard(container: HTMLElement, annotation: Annotation) {
    const a = annotation;
    const isEditing = this.editingId === a.id;
    const card = container.createDiv("aa-card");
    if (isEditing) card.addClass("is-editing");

    // 顶部色条
    const stripe = card.createDiv("aa-card-color-stripe");
    stripe.style.background = a.color;

    // 装订孔
    const holes = card.createDiv("aa-card-holes");
    for (let i = 0; i < 3; i++) holes.createDiv("aa-card-hole");

    // 多选复选框
    if (this.isMultiSelectMode && !isEditing) {
      const checkboxContainer = card.createDiv("aa-card-checkbox");
      checkboxContainer.style.cssText = "position:absolute;top:6px;left:24px;z-index:4;";
      const checkbox = checkboxContainer.createEl("input", { type: "checkbox" });
      checkbox.checked = this.selectedAnnotations.has(a.id);
      checkbox.style.cssText = "cursor:pointer;";
      checkbox.onchange = () => {
        if (checkbox.checked) {
          this.selectedAnnotations.add(a.id);
        } else {
          this.selectedAnnotations.delete(a.id);
        }
        this.render();
      };
    }

    // 内容区
    const body = card.createDiv("aa-card-body");
    const colorName = getColorName(a.color, this.plugin) || t("ui.highlights", this.plugin);

    if (isEditing) {
      // ===== 编辑模式 =====
      const headerRow = body.createDiv("aa-card-header");
      const typeBadge = headerRow.createEl("span");
      typeBadge.setText(colorName);
      typeBadge.addClass("aa-card-color-label");
      typeBadge.style.color = a.color;

      const textEl = body.createDiv("aa-card-text");
      textEl.setText(a.highlightedText);

      const textarea = body.createEl("textarea", { cls: "aa-card-edit-textarea" });
      textarea.value = a.noteContent || "";
      textarea.placeholder = t("ui.placeholder", this.plugin);
      textarea.rows = 3;
      const editHint = body.createDiv("aa-card-edit-hint");
      editHint.setText(t("ui.cardEditHint", this.plugin).replace("${shortcut}", chordLabel()));

      const lineInfo = body.createDiv("aa-card-line");
      lineInfo.setText(getAnnotationLocationLabel(a, this.plugin));

      const editActions = body.createDiv("aa-card-actions");
      const saveBtn = editActions.createEl("button", {
        text: t("ui.saveAction", this.plugin),
        attr: { type: "button" }
      });
      saveBtn.addClass("is-accent");
      saveBtn.onclick = async (e) => {
        e.stopPropagation();
        await this.plugin.updateAnnotation(a.id, { noteContent: textarea.value.trim() });
        this.editingId = null;
        this.render();
      };
      const cancelBtn = editActions.createEl("button", {
        text: t("ui.cancel", this.plugin),
        attr: { type: "button" }
      });
      cancelBtn.onclick = (e) => {
        e.stopPropagation();
        this.editingId = null;
        this.render();
      };

      const ownerWindow = textarea.ownerDocument.defaultView ?? window;
      ownerWindow.requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      });

      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { e.preventDefault(); this.editingId = null; this.render(); }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveBtn.click(); }
      });

      textarea.addEventListener("blur", () => {
        ownerWindow.setTimeout(() => {
          const active = textarea.ownerDocument.activeElement;
          if (this.editingId === a.id && active !== textarea) {
            void this.plugin.updateAnnotation(a.id, { noteContent: textarea.value.trim() });
            this.editingId = null;
            this.render();
          }
        }, 150);
      });

    } else {
      // ===== 展示模式 =====
      const headerRow = body.createDiv("aa-card-header");
      const typeBadge = headerRow.createEl("span");
      typeBadge.setText(colorName);
      typeBadge.addClass("aa-card-color-label");
      typeBadge.style.color = a.color;
      headerRow.createEl("span", { text: formatTime(a.created, this.plugin) }).addClass("aa-card-time");

      const textEl = body.createDiv("aa-card-text");
      textEl.setText(a.highlightedText);

      if (a.noteContent) {
        const noteEl = body.createDiv("aa-card-note");
        noteEl.setText(a.noteContent);
      }
      const anchorLabel = this.anchorStatusText(a.anchor);
      if (anchorLabel) {
        const status = body.createDiv("aa-anchor-status");
        status.setText(anchorLabel);
      }

      const lineInfo = body.createDiv("aa-card-line");
      lineInfo.setText(getAnnotationLocationLabel(a, this.plugin));

      const cardActions = body.createDiv("aa-card-actions");
      const editBtn = cardActions.createEl("button", {
        text: t("ui.edit", this.plugin),
        attr: { type: "button" }
      });
      editBtn.onclick = (e) => {
        e.stopPropagation();
        this.editingId = a.id;
        this.render();
      };
      const located = a.anchor == null || a.anchor === "ok";
      if (!located) {
        const reassignBtn = cardActions.createEl("button", {
          text: t("ui.reassign", this.plugin),
          attr: { type: "button" }
        });
        reassignBtn.onclick = (event) => {
          event.stopPropagation();
          void this.plugin.reassignAnnotation(a);
        };
      }
      const navBtn = cardActions.createEl("button", {
        text: t("ui.navigate", this.plugin),
        attr: { type: "button" }
      });
      navBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!located) {
          await this.plugin.revealUnanchored(a);
          return;
        }
        await this.plugin.navigateToAnnotation(a);
      };
      const deleteBtn = cardActions.createEl("button", {
        text: t("ui.delete", this.plugin),
        attr: { type: "button" }
      });
      deleteBtn.addClass("is-danger");
      deleteBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm(t("ui.deleteConfirm", this.plugin))) return;
        await this.plugin.removeAnnotation(a.id, true);
        this.render();
      };

      // 单击正文定位；Enter 或「编辑」进入编辑
      body.tabIndex = 0;
      body.addEventListener("keydown", (evt) => {
        if (evt.target !== body || evt.key !== "Enter")
          return;
        evt.preventDefault();
        this.editingId = a.id;
        this.render();
      });
      body.addEventListener("click", (evt) => {
        const target = evt.target;
        if (!(target instanceof Element) || target.closest(".aa-card-actions"))
          return;
        if (a.anchor && a.anchor !== "ok") {
          void this.plugin.revealUnanchored(a);
          return;
        }
        void this.plugin.navigateToAnnotation(a);
      });
      body.addClass("is-navigable");
    }

    // 拖拽排序（仅当前文件内）
    card.draggable = true;
    card.dataset.annotationId = a.id;
    card.addClass("aa-draggable-card");

    card.addEventListener("dragstart", (ev) => {
      card.addClass("aa-card-dragging");
      if (ev.dataTransfer) {
        ev.dataTransfer.effectAllowed = "move";
        ev.dataTransfer.setData("text/plain", a.id);
      }
    });

    card.addEventListener("dragend", () => {
      card.removeClass("aa-card-dragging");
      container.querySelectorAll(".aa-card-drop-target").forEach((el) => el.classList.remove("aa-card-drop-target"));
    });

    card.addEventListener("dragover", (ev) => {
      ev.preventDefault();
      card.addClass("aa-card-drop-target");
    });

    card.addEventListener("dragleave", () => {
      card.removeClass("aa-card-drop-target");
    });

    card.addEventListener("drop", async (ev) => {
      ev.preventDefault();
      card.removeClass("aa-card-drop-target");
      const fromId = ev.dataTransfer?.getData("text/plain");
      const toId = a.id;
      if (!fromId || fromId === toId)
        return;

      const currentFile = this.currentFile;
      if (!currentFile)
        return;
      const current = [...this.plugin.getAnnotationsForFile(currentFile.path)].sort((x, y) => {
        const xo = typeof x.order === "number" ? x.order : x.created;
        const yo = typeof y.order === "number" ? y.order : y.created;
        return yo - xo;
      });

      const fromIdx = current.findIndex((x) => x.id === fromId);
      const toIdx = current.findIndex((x) => x.id === toId);
      if (fromIdx < 0 || toIdx < 0)
        return;

      const [moved] = current.splice(fromIdx, 1);
      if (!moved)
        return;
      current.splice(toIdx, 0, moved);

      const base = Date.now();
      const reordered = current.map((ann, i) => normalizeAnnotation({
        ...ann,
        order: base - i,
        updated: Date.now()
      }));
      this.plugin.data = this.plugin.data.map((ann) => {
        if (ann.filePath !== currentFile.path)
          return ann;
        const next = reordered.find((c) => c?.id === ann.id);
        return next ? next : ann;
      });
      await this.plugin.saveAnnotations();
      this.render();
    });
  }
  showCreateGroupDialog() {
    const selectedIds = Array.from(this.selectedAnnotations);
    if (selectedIds.length === 0) return;
    
    // 创建对话框
    const modal = new Modal(this.plugin.app);
    modal.titleEl.setText(t("ui.createGroup", this.plugin));
    
    const content = modal.contentEl;
    content.createEl("p", { 
      text: t("ui.groupAssignPrompt", this.plugin).replace("${n}", String(selectedIds.length))
    });
    
    const input = content.createEl("input", {
      type: "text",
      placeholder: t("ui.groupName", this.plugin)
    });
    input.addClass("aa-input");
    
    const buttonContainer = content.createDiv("aa-modal-buttons");
    
    const cancelBtn = buttonContainer.createEl("button", { text: t("ui.cancel", this.plugin) });
    cancelBtn.addClass("aa-button");
    cancelBtn.addClass("aa-button-secondary");
    cancelBtn.onclick = () => modal.close();
    
    const confirmBtn = buttonContainer.createEl("button", { text: t("ui.createGroup", this.plugin) });
    confirmBtn.style.cssText = "background:var(--interactive-accent);color:var(--text-on-accent);";
    confirmBtn.addClass("aa-button");
    confirmBtn.addClass("aa-button-primary");
    confirmBtn.onclick = async () => {
      const groupName = input.value.trim();
      const currentFile = this.currentFile;
      if (!groupName || !currentFile) return;
      
      // 创建分组
      const group = await this.plugin.addGroup(groupName, currentFile.path);
      
      // 将选中的批注添加到分组
      for (const annotationId of selectedIds) {
        await this.plugin.addAnnotationToGroup(annotationId, group.id);
      }
      
      // 退出多选模式
      this.isMultiSelectMode = false;
      this.selectedAnnotations.clear();
      
      modal.close();
      this.render();
    };
    
    // 回车确认
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmBtn.click();
      }
    });
    
    modal.open();
    input.focus();
  }
  showRenameGroupDialog(group: HighlightGroup) {
    const modal = new Modal(this.plugin.app);
    modal.titleEl.setText(t("ui.renameGroup", this.plugin));
    
    const content = modal.contentEl;
    content.createEl("p", { 
      text: t("ui.renameGroupPrompt", this.plugin).replace("${name}", group.name)
    });
    
    const input = content.createEl("input", {
      type: "text",
      value: group.name
    });
    input.addClass("aa-input");
    
    const buttonContainer = content.createDiv("aa-modal-buttons");
    
    const cancelBtn = buttonContainer.createEl("button", { text: t("ui.cancel", this.plugin) });
    cancelBtn.addClass("aa-button");
    cancelBtn.addClass("aa-button-secondary");
    cancelBtn.onclick = () => modal.close();
    
    const confirmBtn = buttonContainer.createEl("button", { text: t("ui.renameGroup", this.plugin) });
    confirmBtn.style.cssText = "background:var(--interactive-accent);color:var(--text-on-accent);";
    confirmBtn.addClass("aa-button");
    confirmBtn.addClass("aa-button-primary");
    confirmBtn.onclick = async () => {
      const newName = input.value.trim();
      if (!newName || newName === group.name) {
        modal.close();
        return;
      }
      
      await this.plugin.renameGroup(group.id, newName);
      modal.close();
      this.render();
    };
    
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmBtn.click();
      }
    });
    
    modal.open();
    input.select();
  }
};
