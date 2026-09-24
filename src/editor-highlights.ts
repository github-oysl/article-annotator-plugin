/** CodeMirror 里的高亮装饰。批注存在独立文件里，这里只负责画出来。 */
import { Editor, MarkdownView, type App } from "obsidian";
import { EditorView, Decoration } from "@codemirror/view";
import { StateEffect, StateField } from "@codemirror/state";
import { isMarkdownPosition } from "./annotation-model";
import type { Annotation, MarkdownPosition } from "./types";

export interface HighlightHost {
  app: App;
  getAnnotationsForFile(filePath: string): Annotation[];
}

// CM6 StateEffect：通知装饰层更新高亮
interface HighlightSpan {
  from: number;
  to: number;
  color: string;
  annotationId: string;
}

const setHighlightsEffect = StateEffect.define<HighlightSpan[]>();

// CM6 StateField：管理 Decoration.mark 集合，自动跟随编辑调整位置
export const highlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (let e of tr.effects) {
      if (e.is(setHighlightsEffect)) {
        const ranges = e.value;
        if (!ranges || ranges.length === 0) {
          decorations = Decoration.none;
        } else {
          const marks = ranges.map((r) => Decoration.mark({
            attributes: {
              style: `background-color: ${r.color}40; border-bottom: 2px solid ${r.color}; border-radius: 2px;`,
              "data-annotation-id": r.annotationId || ""
            }
          }).range(r.from, r.to));
          decorations = Decoration.set(marks, true);
        }
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f)
});

// 刷新当前编辑器高亮：从 annotation 数据计算文档偏移量，dispatch 到 CM6

export function getCodeMirror(editor: Editor): EditorView | null {
  const cm = (editor as Editor & { cm?: EditorView }).cm;
  return cm ?? null;
}

export function refreshHighlights(plugin: HighlightHost): void {
  const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view?.file)
    return;
  const cm = getCodeMirror(view.editor);
  if (!cm)
    return;
  const annotations = plugin.getAnnotationsForFile(view.file.path).filter((ann): ann is Annotation & { position: MarkdownPosition } => ann.fileType !== "pdf" && ann.anchor === "ok" && isMarkdownPosition(ann.position));
  if (annotations.length === 0) {
    cm.dispatch({ effects: setHighlightsEffect.of([]) });
    return;
  }
  const doc = cm.state.doc;
  const ranges: HighlightSpan[] = [];
  for (const ann of annotations) {
    const startLine = ann.position.startLine + 1;
    const endLine = ann.position.endLine + 1;
    if (startLine > doc.lines || endLine > doc.lines)
      continue;
    const from = doc.line(startLine).from + ann.position.startCh;
    const to = doc.line(endLine).from + ann.position.endCh;
    if (from >= 0 && to <= doc.length && from <= to) {
      ranges.push({ from, to, color: ann.color, annotationId: ann.id });
    }
  }
  cm.dispatch({ effects: setHighlightsEffect.of(ranges) });
}
