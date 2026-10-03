export { createAuth, type AuthDeps } from './provider.js'
export { createAuthStore } from './db-store.js'
export {
  createMemoryAuthStore,
  type MemoryAuthStore,
  type MemoryMember,
} from './memory-store.js'
export type {
  AuthProvider,
  CallerRequest,
  LinkDelivery,
  LinkKind,
  MemberRef,
  OutgoingLink,
  SessionCookie,
  VerifyResult,
} from './types.js'
