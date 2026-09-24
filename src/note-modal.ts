/** 写批注的弹窗。快捷键只打开草稿，确认后才交给插件保存。 */
import { type App, Modal } from "obsidian";
import { validateHexColor } from "./annotation-model";
import { chordLabel, getColorName, t } from "./i18n";
import type ArticleAnnotator from "./main";

export class NoteModal extends Modal {
  plugin: ArticleAnnotator;
  highlightedText: string;
  color: string;
  onSave: (content: string, color: string, tags: string[]) => void | Promise<void>;
  textarea: HTMLTextAreaElement | null = null;
  draftContent = "";
  tags: string[] = [];
  tagRow: HTMLElement | null = null;
  /** save：按钮或快捷键；discard：取消或 Esc；implicit：点遮罩或标题栏关闭。 */
  closeReason: "save" | "discard" | "implicit" = "implicit";
  settled = false;

  constructor(app: App, plugin: ArticleAnnotator, seed: { highlightedText: string; color: string; noteContent?: string; tags?: string[] }, onSave: (content: string, color: string, tags: string[]) => void | Promise<void>) {
    super(app);
    this.plugin = plugin;
    this.highlightedText = seed.highlightedText;
    this.color = seed.color;
    this.draftContent = seed.noteContent || "";
    this.tags = [...(seed.tags ?? [])];
    this.onSave = onSave;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("aa-note-modal");
    this.setTitle(t("ui.noteComposerTitle", this.plugin));
    const quoteBlock = contentEl.createDiv("aa-note-modal-quote");
    quoteBlock.createEl("p", { text: this.highlightedText });
    quoteBlock.style.setProperty("--aa-quote-accent", this.color);
    const colorRow = contentEl.createDiv("aa-note-modal-colors");
    colorRow.createEl("span", { text: t("ui.color", this.plugin) });
    this.colorChoices().forEach((color) => {
      const swatch = colorRow.createEl("button", {
        cls: "aa-color-swatch",
        attr: {
          type: "button",
          "aria-label": this.colorLabel(color),
          "aria-pressed": color === this.color ? "true" : "false"
        }
      });
      swatch.style.background = color;
      if (color === this.color)
        swatch.addClass("is-selected");
      swatch.onclick = () => {
        this.color = color;
        quoteBlock.style.setProperty("--aa-quote-accent", color);
        contentEl.querySelectorAll(".aa-color-swatch").forEach((el) => {
          el.classList.remove("is-selected");
          if (el instanceof HTMLButtonElement)
            el.setAttr("aria-pressed", "false");
        });
        swatch.addClass("is-selected");
        swatch.setAttr("aria-pressed", "true");
      };
    });
    this.tagRow = contentEl.createDiv("aa-note-tags");
    this.renderTags();
    const textarea = contentEl.createEl("textarea", {
      attr: { placeholder: t("ui.placeholder", this.plugin), rows: "8" }
    });
    textarea.value = this.draftContent;
    this.textarea = textarea;
    textarea.addEventListener("input", () => {
      this.draftContent = textarea.value;
    });
    const hint = contentEl.createDiv("aa-note-modal-hint");
    hint.setText(t("ui.saveHint", this.plugin).replace("${shortcut}", chordLabel()));
    const btnRow = contentEl.createDiv("aa-modal-buttons");
    const saveBtn = btnRow.createEl("button", {
      text: `${t("ui.saveAction", this.plugin)} · ${chordLabel()}`,
      attr: { type: "button" }
    });
    saveBtn.addClass("aa-button");
    saveBtn.addClass("aa-button-primary");
    const cancelBtn = btnRow.createEl("button", {
      text: t("ui.cancel", this.plugin),
      attr: { type: "button" }
    });
    cancelBtn.addClass("aa-button");
    cancelBtn.addClass("aa-button-secondary");
    saveBtn.onclick = () => this.requestSave();
    cancelBtn.onclick = () => this.requestDiscard();
    this.bindSaveKeys();
    const ownerWindow = this.containerEl.ownerDocument.defaultView ?? window;
    ownerWindow.setTimeout(() => textarea.focus(), 30);
  }
  renderTags() {
    const row = this.tagRow;
    if (!row)
      return;
    row.empty();
    this.tags.forEach((tag, index) => {
      const chip = row.createSpan({ cls: "aa-note-tag" });
      chip.createSpan({ text: tag });
      const remove = chip.createEl("button", {
        text: "×",
        attr: { type: "button", "aria-label": `${t("ui.removeTag", this.plugin)} ${tag}` }
      });
      remove.onclick = () => {
        this.tags.splice(index, 1);
        this.renderTags();
      };
    });
    const input = row.createEl("input", {
      attr: { type: "text", placeholder: t("ui.tagName", this.plugin), "aria-label": t("ui.addTag", this.plugin) }
    });
    input.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter" || evt.ctrlKey || evt.metaKey || evt.isComposing)
        return;
      evt.preventDefault();
      evt.stopPropagation();
      const tag = input.value.trim();
      if (tag && !this.tags.includes(tag))
        this.tags.push(tag);
      this.renderTags();
      this.tagRow?.querySelector("input")?.focus();
    });
  }
  colorChoices(): string[] {
    const colors = [...this.plugin.settings.colors];
    const custom = this.plugin.settings.customHighlightColor;
    if (custom && validateHexColor(custom) && !colors.includes(custom))
      colors.push(custom);
    return colors;
  }
  colorLabel(color: string): string {
    if (color === this.plugin.settings.customHighlightColor && this.plugin.settings.customHighlightColorName)
      return this.plugin.settings.customHighlightColorName;
    return getColorName(color, this.plugin);
  }
  /** 把处理函数插到作用域最前，避免弹窗自带的 Esc 先把窗口关掉。 */
  registerScopeKey(modifiers: Array<"Mod" | "Ctrl" | "Meta" | "Shift" | "Alt">, key: string, func: (evt: KeyboardEvent) => false | void) {
    const handler = this.scope.register(modifiers, key, func);
    const record = this.scope as unknown as Record<string, unknown>;
    for (const name of ["keys", "_keys"]) {
      const bucket = record[name];
      if (!Array.isArray(bucket))
        continue;
      const index = bucket.indexOf(handler);
      if (index > 0) {
        bucket.splice(index, 1);
        bucket.unshift(handler);
      }
      return;
    }
  }
  bindSaveKeys() {
    const save = (evt: KeyboardEvent) => {
      if (evt.isComposing)
        return;
      this.requestSave();
      return false as const;
    };
    this.registerScopeKey(["Mod"], "Enter", save);
    this.registerScopeKey(["Ctrl"], "Enter", save);
    this.registerScopeKey([], "Escape", (evt) => {
      if (evt.isComposing)
        return;
      this.requestDiscard();
      return false;
    });
    this.modalEl.addEventListener("keydown", (evt) => {
      if (evt.isComposing)
        return;
      if (evt.key === "Escape") {
        this.closeReason = "discard";
        return;
      }
      if (evt.key === "Enter" && (evt.ctrlKey || evt.metaKey)) {
        evt.preventDefault();
        evt.stopPropagation();
        this.requestSave();
      }
    }, true);
  }
  requestSave() {
    if (this.settled || this.closeReason === "save")
      return;
    this.draftContent = this.textarea?.value ?? this.draftContent;
    this.closeReason = "save";
    this.close();
  }
  requestDiscard() {
    if (this.settled)
      return;
    this.closeReason = "discard";
    this.close();
  }
  onClose() {
    this.draftContent = this.textarea?.value ?? this.draftContent;
    const content = this.draftContent;
    const color = this.color;
    const tags = [...this.tags];
    const reason = this.closeReason;
    this.contentEl.empty();
    this.textarea = null;
    if (this.settled)
      return;
    this.settled = true;
    const hasText = content.trim().length > 0;
    if (reason === "save" || (reason === "implicit" && hasText))
      void this.onSave(content, color, tags);
  }
};
