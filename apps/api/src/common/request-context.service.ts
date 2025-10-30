import { Injectable } from "@nestjs/common";
import { AsyncLocalStorage } from "node:async_hooks";
import type { UserRole } from "../auth/types";

interface AuthContext {
  userId: string;
  clinicId: string;
  role: UserRole;
  email: string;
}

interface RequestContextStore {
  auth?: AuthContext;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContextStore>();

  run<T>(callback: () => T): T {
    return this.storage.run({}, callback);
  }

  getStore(): RequestContextStore | undefined {
    return this.storage.getStore();
  }

  setAuthContext(context: AuthContext): void {
    const store = this.storage.getStore();

    if (!store) {
      throw new Error("Request context is not initialized");
    }

    store.auth = context;
  }

  getAuthContext(): AuthContext | undefined {
    return this.storage.getStore()?.auth;
  }

  getClinicId(): string | undefined {
    return this.getAuthContext()?.clinicId;
  }

  getUserId(): string | undefined {
    return this.getAuthContext()?.userId;
  }

  getRole(): UserRole | undefined {
    return this.getAuthContext()?.role;
  }

  getEmail(): string | undefined {
    return this.getAuthContext()?.email;
  }
}
