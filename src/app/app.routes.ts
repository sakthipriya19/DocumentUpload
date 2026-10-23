import { Routes } from '@angular/router';
import { authGuard } from './api.service';
import { DocListComponent } from './doc-list.component';
import { EditorComponent } from './editor.component';
import { LoginComponent } from './login.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: DocListComponent, canActivate: [authGuard] },
  { path: 'docs/:id', component: EditorComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
