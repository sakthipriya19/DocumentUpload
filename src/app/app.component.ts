import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { ApiService } from './api.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="topbar">
      <a routerLink="/" class="brand">Ajaia Docs</a>
      @if (api.user(); as u) {
        <span class="spacer"></span>
        <span class="who">{{ u.name }} <small>({{ u.email }})</small></span>
        <button class="btn" (click)="logout()">Switch user</button>
      }
    </header>
    <main class="page"><router-outlet /></main>
  `,
})
export class AppComponent {
  api = inject(ApiService);
  private router = inject(Router);

  logout() {
    this.api.logout();
    this.router.navigateByUrl('/login');
  }
}
