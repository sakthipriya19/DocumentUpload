import { HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { DocFull, DocSummary, ShareEntry, ShareRole, User } from './models';

const TOKEN_KEY = 'ajaia.token';
const USER_KEY = 'ajaia.user';

export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Check your connection.';
    if (err.error?.error) return err.error.error;
    // A 5xx without our JSON body comes from the dev proxy when the API isn't running.
    if (err.status >= 500) return 'API server is not responding. Run "npm run dev" (starts API + UI) or "npm run server".';
    return `Request failed (${err.status}).`;
  }
  return 'Something went wrong.';
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  readonly user = signal<User | null>(this.readUser());

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private readUser(): User | null {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) ?? 'null');
    } catch {
      return null;
    }
  }

  demoUsers() {
    return this.http.get<User[]>('/api/users');
  }

  login(email: string) {
    return this.http.post<{ token: string; user: User }>('/api/login', { email }).pipe(
      tap((res) => {
        localStorage.setItem(TOKEN_KEY, res.token);
        localStorage.setItem(USER_KEY, JSON.stringify(res.user));
        this.user.set(res.user);
      })
    );
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
  }

  listDocs() {
    return this.http.get<DocSummary[]>('/api/documents');
  }
  createDoc(title?: string) {
    return this.http.post<DocFull>('/api/documents', title ? { title } : {});
  }
  getDoc(id: number) {
    return this.http.get<DocFull>(`/api/documents/${id}`);
  }
  updateDoc(id: number, patch: { title?: string; content?: string }) {
    return this.http.put<DocFull>(`/api/documents/${id}`, patch);
  }
  deleteDoc(id: number) {
    return this.http.delete<void>(`/api/documents/${id}`);
  }
  share(id: number, email: string, role: ShareRole) {
    return this.http.post<ShareEntry[]>(`/api/documents/${id}/shares`, { email, role });
  }
  unshare(id: number, userId: number) {
    return this.http.delete<ShareEntry[]>(`/api/documents/${id}/shares/${userId}`);
  }
  importFile(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<DocFull>('/api/documents/import', form);
  }
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const api = inject(ApiService);
  const router = inject(Router);
  const token = api.token;
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((err) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && !req.url.endsWith('/api/login')) {
        api.logout();
        router.navigateByUrl('/login');
      }
      return throwError(() => err);
    })
  );
};

export const authGuard: CanActivateFn = () => {
  const api = inject(ApiService);
  return api.token ? true : inject(Router).parseUrl('/login');
};
