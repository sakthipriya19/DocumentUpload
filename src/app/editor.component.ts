import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import Quill from 'quill';
import { ApiService, errorMessage } from './api.service';
import { DocFull, ShareRole } from './models';

const AUTOSAVE_MS = 800;

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="row between">
      <a routerLink="/" class="link">← All documents</a>
      <span class="status" [class.err]="status() === 'error'" aria-live="polite">
        @switch (status()) {
          @case ('saving') { Saving… }
          @case ('saved') { All changes saved }
          @case ('error') { Save failed }
          @default { }
        }
      </span>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (doc(); as d) {
      <div class="row titlebar">
        <input
          class="title"
          aria-label="Document title"
          [(ngModel)]="title"
          [disabled]="!canEdit()"
          maxlength="200"
          (blur)="commitTitle()"
          (keydown.enter)="commitTitle()"
        />
        @if (d.access === 'owner') {
          <span class="badge owner">Owner</span>
        } @else if (d.access === 'editor') {
          <span class="badge editor">Shared · can edit</span>
        } @else {
          <span class="badge viewer">Shared · view only</span>
        }
      </div>
      @if (d.access !== 'owner') {
        <p class="muted small">Owned by {{ d.ownerName }} ({{ d.ownerEmail }})</p>
      }
    }

    <div class="editor-wrap">
      <div #editor></div>
    </div>

    @if (doc(); as d) {
      @if (d.access === 'owner') {
        <section class="card share">
          <h2>Share</h2>
          <form class="row" (ngSubmit)="addShare()">
            <input name="shareEmail" type="email" placeholder="Email (try bob@example.com)" [(ngModel)]="shareEmail" required />
            <select name="shareRole" [(ngModel)]="shareRole" aria-label="Permission">
              <option value="editor">Can edit</option>
              <option value="viewer">View only</option>
            </select>
            <button class="btn primary" type="submit" [disabled]="!shareEmail">Share</button>
          </form>
          @if (shareError()) {
            <p class="error" role="alert">{{ shareError() }}</p>
          }
          @if (d.shares.length === 0) {
            <p class="muted small">Not shared with anyone yet.</p>
          }
          <ul class="doclist">
            @for (s of d.shares; track s.userId) {
              <li>
                <span>{{ s.name }} <small class="muted">{{ s.email }}</small></span>
                <span class="badge" [class.editor]="s.role === 'editor'" [class.viewer]="s.role === 'viewer'">
                  {{ s.role === 'editor' ? 'Can edit' : 'View only' }}
                </span>
                <button class="link danger" (click)="removeShare(s.userId)">Remove</button>
              </li>
            }
          </ul>
        </section>
      }
    }
  `,
})
export class EditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editor', { static: true }) editorEl!: ElementRef<HTMLDivElement>;

  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  doc = signal<DocFull | null>(null);
  status = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  error = signal('');
  shareError = signal('');
  title = '';
  shareEmail = '';
  shareRole: ShareRole = 'editor';

  private quill?: Quill;
  private id = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private dirty = false;

  canEdit() {
    const d = this.doc();
    return !!d && d.access !== 'viewer';
  }

  ngAfterViewInit() {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.quill = new Quill(this.editorEl.nativeElement, {
      theme: 'snow',
      placeholder: 'Start writing…',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean'],
        ],
      },
    });
    this.quill.enable(false); // locked until the document (and our access level) is known

    this.quill.on('text-change', (_delta, _old, source) => {
      if (source !== 'user') return;
      this.dirty = true;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.flush(), AUTOSAVE_MS);
    });

    this.api.getDoc(this.id).subscribe({
      next: (d) => {
        this.doc.set(d);
        this.title = d.title;
        this.quill!.clipboard.dangerouslyPasteHTML(d.content || '', 'silent');
        const editable = d.access !== 'viewer';
        this.quill!.enable(editable);
        const toolbar = (this.quill!.getModule('toolbar') as unknown as { container: HTMLElement }).container;
        toolbar.style.display = editable ? '' : 'none';
      },
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  ngOnDestroy() {
    clearTimeout(this.timer);
    if (this.dirty) this.flush(); // don't lose the last edits when navigating away
  }

  private save(patch: { title?: string; content?: string }) {
    this.status.set('saving');
    this.api.updateDoc(this.id, patch).subscribe({
      next: (d) => {
        this.doc.update((cur) => (cur ? { ...cur, title: d.title, updatedAt: d.updatedAt } : cur));
        this.status.set('saved');
      },
      error: (e) => {
        this.status.set('error');
        this.error.set(errorMessage(e));
      },
    });
  }

  flush() {
    if (!this.quill || !this.dirty || !this.canEdit()) return;
    this.dirty = false;
    this.error.set('');
    this.save({ content: this.quill.getSemanticHTML() });
  }

  commitTitle() {
    const d = this.doc();
    if (!d || !this.canEdit()) return;
    const next = this.title.trim();
    if (!next) {
      this.title = d.title; // empty titles are rejected; revert
      return;
    }
    if (next === d.title) return;
    this.error.set('');
    this.save({ title: next });
  }

  addShare() {
    this.shareError.set('');
    this.api.share(this.id, this.shareEmail, this.shareRole).subscribe({
      next: (shares) => {
        this.doc.update((cur) => (cur ? { ...cur, shares } : cur));
        this.shareEmail = '';
      },
      error: (e) => this.shareError.set(errorMessage(e)),
    });
  }

  removeShare(userId: number) {
    this.shareError.set('');
    this.api.unshare(this.id, userId).subscribe({
      next: (shares) => this.doc.update((cur) => (cur ? { ...cur, shares } : cur)),
      error: (e) => this.shareError.set(errorMessage(e)),
    });
  }
}
