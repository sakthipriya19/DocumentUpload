import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService, errorMessage } from './api.service';
import { DocSummary } from './models';

@Component({
  selector: 'app-doc-list',
  standalone: true,
  imports: [RouterLink, DatePipe],
  template: `
    <div class="row between">
      <h1>Documents</h1>
      <div class="row">
        <label class="btn" [class.disabled]="busy()">
          Import file
          <input type="file" accept=".txt,.md,.docx" hidden (change)="onFile($event)" [disabled]="busy()" />
        </label>
        <button class="btn primary" (click)="create()" [disabled]="busy()">+ New document</button>
      </div>
    </div>
    <p class="muted small">Import supports <strong>.txt, .md and .docx</strong> files up to 2 MB. Each import becomes a new editable document.</p>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <h2>My documents <span class="count">{{ owned().length }}</span></h2>
    @if (loading()) {
      <p class="muted">Loading…</p>
    } @else if (owned().length === 0) {
      <p class="muted">No documents yet. Create one or import a file.</p>
    }
    <ul class="doclist">
      @for (d of owned(); track d.id) {
        <li>
          <a [routerLink]="['/docs', d.id]">{{ d.title }}</a>
          <span class="badge owner">Owner</span>
          <span class="muted small">Updated {{ d.updatedAt | date: 'medium' }}</span>
          <button class="link danger" (click)="remove(d)" [attr.aria-label]="'Delete ' + d.title">Delete</button>
        </li>
      }
    </ul>

    <h2>Shared with me <span class="count">{{ shared().length }}</span></h2>
    @if (!loading() && shared().length === 0) {
      <p class="muted">Nothing has been shared with you yet.</p>
    }
    <ul class="doclist">
      @for (d of shared(); track d.id) {
        <li>
          <a [routerLink]="['/docs', d.id]">{{ d.title }}</a>
          <span class="badge" [class.editor]="d.access === 'editor'" [class.viewer]="d.access === 'viewer'">
            {{ d.access === 'editor' ? 'Can edit' : 'View only' }}
          </span>
          <span class="muted small">from {{ d.ownerName }} · Updated {{ d.updatedAt | date: 'medium' }}</span>
        </li>
      }
    </ul>
  `,
})
export class DocListComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  docs = signal<DocSummary[]>([]);
  owned = computed(() => this.docs().filter((d) => d.access === 'owner'));
  shared = computed(() => this.docs().filter((d) => d.access !== 'owner'));
  loading = signal(true);
  busy = signal(false);
  error = signal('');

  ngOnInit() {
    this.refresh();
  }

  refresh() {
    this.api.listDocs().subscribe({
      next: (d) => {
        this.docs.set(d);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.loading.set(false);
      },
    });
  }

  create() {
    this.busy.set(true);
    this.api.createDoc().subscribe({
      next: (d) => this.router.navigate(['/docs', d.id]),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }

  onFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.txt', '.md', '.docx'].includes(ext)) {
      this.error.set('Unsupported file type. Please choose a .txt, .md or .docx file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      this.error.set('File is too large (max 2 MB).');
      return;
    }
    this.busy.set(true);
    this.api.importFile(file).subscribe({
      next: (d) => this.router.navigate(['/docs', d.id]),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }

  remove(d: DocSummary) {
    if (!confirm(`Delete "${d.title}"? This also removes it for anyone it is shared with.`)) return;
    this.api.deleteDoc(d.id).subscribe({
      next: () => this.docs.update((list) => list.filter((x) => x.id !== d.id)),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }
}
