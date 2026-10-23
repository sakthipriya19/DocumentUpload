import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService, errorMessage } from './api.service';
import { User } from './models';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  template: `
    <section class="card narrow">
      <h1>Sign in</h1>
      <p class="muted">Demo accounts are seeded (no passwords). Pick one, then switch users to test sharing.</p>
      <div class="stack">
        @for (u of users(); track u.id) {
          <button class="btn block" (click)="signIn(u.email)">
            <strong>{{ u.name }}</strong> <small>{{ u.email }}</small>
          </button>
        }
      </div>
      <form class="row" (ngSubmit)="signIn(email)">
        <input name="email" type="email" placeholder="or type a seeded email" [(ngModel)]="email" />
        <button class="btn primary" type="submit" [disabled]="!email">Sign in</button>
      </form>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
})
export class LoginComponent implements OnInit {
  private api = inject(ApiService);
  private router = inject(Router);
  users = signal<User[]>([]);
  error = signal('');
  email = '';

  ngOnInit() {
    this.api.demoUsers().subscribe({
      next: (u) => this.users.set(u),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  signIn(email: string) {
    this.error.set('');
    this.api.login(email).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }
}
