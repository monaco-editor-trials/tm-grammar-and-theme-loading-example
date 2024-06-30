import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  NgZone,
} from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import * as monaco from 'monaco-editor';
import { editor } from 'monaco-editor';
import { loadWASM } from 'onigasm';
import { Registry } from 'monaco-textmate';
import { wireTmGrammars } from 'monaco-editor-textmate';
import { IVSCodeTheme, convertTheme } from '@estruyf/vscode-theme-converter';
import { ThemeInfo, themes } from 'tm-themes';
import { GrammarInfo, grammars } from 'tm-grammars';
import { MonacoEditorService } from './monaco-editor-service';
import { first } from 'rxjs';
import 'zone.js';

/**
 * This example contains monaco editor implementation in angular project
 * but monaco editor and zonejs is not compatible with each other.
 * In this case we can't see command palette.
 *
 * BUG: https://github.com/microsoft/monaco-editor/issues/4372
 */
@Component({
  selector: 'app-root',
  standalone: true,
  template: `
    <main>
      <!-- Themes -->
      <select (change)="onThemeChange($event)">
        @for (vsCodeTheme of vsCodeThemes; track vsCodeTheme.name) {
          <option [value]="vsCodeTheme.name">
            {{ vsCodeTheme.displayName }}
          </option>
        }
      </select>

      <!-- Monaco Editor -->
      <div id="editor" #editor>
        <mark> It takes some time to load, please wait. </mark>
      </div>
    </main>
  `,
})
export class App implements OnInit {
  @ViewChild('editor', { static: true })
  public editorRef!: ElementRef;

  public vsCodeThemes: ThemeInfo[] = [];
  public selectedVscodeTheme: ThemeInfo | null = null;
  public tmGrammars: GrammarInfo[] = [];

  private editorInstance:
    | editor.IStandaloneCodeEditor
    | editor.ICodeEditor
    | null = null;
  private editorOptions = {
    value: `const x = {
  value: 'dsfsdfdsf',
  language: 'javascript',
  theme: 'vs-dark',
  minimap: {
    enabled: false,
  },
}`,
    language: 'javascript',
    theme: 'vs-dark',
  };

  public constructor(
    private ngZone: NgZone,
    private monacoEditorService: MonacoEditorService
  ) {
    this.monacoEditorService.load();
  }

  public async ngOnInit(): Promise<void> {
    this.vsCodeThemes = themes;
    this.tmGrammars = grammars;

    // set initial theme
    this.selectedVscodeTheme = themes[0];

    await this.loadWasmFile();
  }

  public async ngAfterViewInit(): Promise<void> {
    await this.initMonacoEditor();
  }

  // #region Load Theme

  public onThemeChange(event: any): void {
    this.loadTheme(
      this.vsCodeThemes.find(
        (theme: ThemeInfo) => theme.name === event.target.value
      ) || this.vsCodeThemes[0]
    );
  }

  public async loadTheme(theme: ThemeInfo) {
    this.selectedVscodeTheme = theme;

    await fetch(`/assets/textmate/themes/${theme.name}.json`).then(
      async (response: Response) => {
        const contentType = response.headers.get('content-type');

        if (contentType === 'application/json' || response.status === 200) {
          const myExportedTheme = await response.json(),
            convertedTheme: editor.IStandaloneThemeData = convertTheme(
              myExportedTheme as IVSCodeTheme
            );

          monaco.editor.defineTheme(theme.name, convertedTheme);
          monaco.editor.setTheme(theme.name);

          // clear warning message
          document.querySelector('mark')?.remove();
        }
      }
    );
  }

  // #endregion

  // #region Load WASM

  private async loadWasmFile(): Promise<void> {
    const onigasmResponse = await fetch(
      'https://cdn.jsdelivr.net/npm/onigasm@latest/lib/onigasm.wasm' // use for web (to prevent CORS etc.)
      // 'onigasm/lib/onigasm.wasm' // use while working on local or custom loaders (webpack, vite, etc.)
    );

    if (
      onigasmResponse.status !== 200 ||
      onigasmResponse.headers.get('content-type') !== 'application/wasm'
    ) {
      return;
    }

    const wasmContent = await onigasmResponse.arrayBuffer();

    if (wasmContent) {
      await loadWASM(wasmContent);
    }
  }

  // #endregion

  private async initMonacoEditor(): Promise<void> {
    // #region Load Monaco Editor

    if (!this.monacoEditorService.loaded) {
      this.monacoEditorService.loadingFinished
        .pipe(first())
        .subscribe(async () => await this.initMonacoEditor());

      return;
    }

    // #endregion

    // #region Register Grammars

    const registry = new Registry({
      getGrammarDefinition: async (scopeName: string): Promise<any> => {
        const response = await await fetch(
            `/assets/textmate/grammars/${scopeName}.json`
          ),
          contentType = response.headers.get('content-type');

        if (contentType === 'application/json' || response.status === 200) {
          const res: any = {
            format: 'json',
            content: response.text(),
          };

          return res;
        }

        return null;
      },
    });

    const grammars = new Map();

    this.tmGrammars.forEach((grammar: GrammarInfo) => {
      monaco.languages.register({ id: grammar.name });
      grammars.set(grammar.name, grammar.name);
    });

    // #endregion

    // #region Init Editor

    this.ngZone.runOutsideAngular(() => {
      this.editorInstance = monaco.editor.create(
        this.editorRef.nativeElement!,
        this.editorOptions
      );
    });

    // #endregion

    // #region Wire Grammars

    if (this.editorInstance) {
      await wireTmGrammars(monaco, registry, grammars, this.editorInstance);
    }

    // #endregion

    // load selected theme
    await this.loadTheme(this.selectedVscodeTheme || this.vsCodeThemes[0]);
  }
}

bootstrapApplication(App);
