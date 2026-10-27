import type { Component } from 'vue'
import {
  createRouter,
  createWebHistory,
  type RouteLocationNormalized,
  type RouteRecordRaw,
} from 'vue-router'
import { NOT_FOUND_TITLE, routeTable, type Access } from '../src/routes'
import { decide } from './guards'
import { claimEventBadge } from './lib/badges'
import { reportEvent } from './lib/events'
import { fromNotice } from './lib/notice'
import { typedProfile } from './lib/onboarding'
import { scrollFor } from './lib/scroll'
import { showScreen } from './lib/tab-title'
import { afterNavigation } from './lib/thanks'
import { loadMe, type Me } from './lib/session'
import AccessRequestedScreen from './screens/AccessRequestedScreen.vue'
import ApplicantsScreen from './screens/ApplicantsScreen.vue'
import AskScreen from './screens/AskScreen.vue'
import BadgeEventsScreen from './screens/BadgeEventsScreen.vue'
import BadgeRowScreen from './screens/BadgeRowScreen.vue'
import BadgesScreen from './screens/BadgesScreen.vue'
import ChallengeScreen from './screens/ChallengeScreen.vue'
import CockpitScreen from './screens/CockpitScreen.vue'
import ConnectScreen from './screens/ConnectScreen.vue'
import ImpressumScreen from './screens/ImpressumScreen.vue'
import InvitesScreen from './screens/InvitesScreen.vue'
import LoginScreen from './screens/LoginScreen.vue'
import MatchesScreen from './screens/MatchesScreen.vue'
import MembersScreen from './screens/MembersScreen.vue'
import ModeratedMemberScreen from './screens/ModeratedMemberScreen.vue'
import ModerationScreen from './screens/ModerationScreen.vue'
import MemberScreen from './screens/MemberScreen.vue'
import NotFoundScreen from './screens/NotFoundScreen.vue'
import NotificationsScreen from './screens/NotificationsScreen.vue'
import OnboardingPrivacyScreen from './screens/OnboardingPrivacyScreen.vue'
import OnboardingProfileScreen from './screens/OnboardingProfileScreen.vue'
import OnboardingUsageScreen from './screens/OnboardingUsageScreen.vue'
import OfferDoneScreen from './screens/OfferDoneScreen.vue'
import OfferNoteScreen from './screens/OfferNoteScreen.vue'
import OfferScreen from './screens/OfferScreen.vue'
import OutboxScreen from './screens/OutboxScreen.vue'
import SettingsScreen from './screens/SettingsScreen.vue'
import PrivacyScreen from './screens/PrivacyScreen.vue'
import ProfileScreen from './screens/ProfileScreen.vue'
import RequestContactScreen from './screens/RequestContactScreen.vue'
import ReportScreen from './screens/ReportScreen.vue'
import RequestScreen from './screens/RequestScreen.vue'
import SignInScreen from './screens/SignInScreen.vue'
import TermsScreen from './screens/TermsScreen.vue'
import TrendPickerScreen from './screens/TrendPickerScreen.vue'
import TrendScreen from './screens/TrendScreen.vue'
import WelcomeScreen from './screens/WelcomeScreen.vue'
import {
  isStaleChunk,
  reloadForStaleChunk,
  settledAfterReload,
} from './lib/stale-chunk'

/**
 * Builds a router record from the shared route table (ADR 0017), so the client
 * cannot invent a path the server has never heard of. An unknown name throws at
 * startup rather than 404-ing in front of a member.
 */
function screen(
  name: string,
  component: Component | (() => Promise<Component>),
): RouteRecordRaw {
  const route = routeTable.find((candidate) => candidate.name === name)
  if (route === undefined) {
    throw new Error(`no route named ${name} in the shared route table`)
  }

  return {
    path: route.path,
    name: route.name,
    component,
    meta: {
      title: route.title,
      access: route.access,
      ...(route.permission === undefined
        ? {}
        : { permission: route.permission }),
    },
  }
}

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior: (to, from, saved) => scrollFor(to.path, from.path, saved),
  routes: [
    screen('entry', LoginScreen),
    screen('login', LoginScreen),
    screen('sign-in', SignInScreen),
    screen('access-requested', AccessRequestedScreen),
    screen('onboarding', OnboardingProfileScreen),
    screen('onboarding-privacy', OnboardingPrivacyScreen),
    screen('onboarding-usage', OnboardingUsageScreen),
    screen('privacy', PrivacyScreen),
    screen('terms', TermsScreen),
    screen('impressum', ImpressumScreen),
    screen('game', () => import('./screens/GameScreen.vue')),
    screen('game-leaderboard', () => import('./screens/LeaderboardScreen.vue')),
    screen('network', () => import('./screens/NetworkScreen.vue')),
    screen('recap', () => import('./screens/RecapScreen.vue')),
    screen('welcome', WelcomeScreen),
    screen('profile', ProfileScreen),
    screen('notifications', NotificationsScreen),
    screen('badges', BadgesScreen),
    screen('badge-events', BadgeEventsScreen),
    screen('badge-row', BadgeRowScreen),
    screen('ask', AskScreen),
    screen('challenge', ChallengeScreen),
    screen('trend-picker', TrendPickerScreen),
    screen('matches', MatchesScreen),
    screen('trend', TrendScreen),
    screen('connect', ConnectScreen),
    screen('cockpit', CockpitScreen),
    screen('offer', OfferScreen),
    screen('offer-note', OfferNoteScreen),
    screen('offer-done', OfferDoneScreen),
    screen('request', RequestScreen),
    screen('request-contact', RequestContactScreen),
    screen('report-challenge', ReportScreen),
    screen('report-request', ReportScreen),
    screen('admin-applicants', ApplicantsScreen),
    screen('admin-invites', InvitesScreen),
    screen('admin-members', MembersScreen),
    screen('admin-member', MemberScreen),
    screen('admin-moderation', ModerationScreen),
    screen('admin-moderated-member', ModeratedMemberScreen),
    screen('admin-outbox', OutboxScreen),
    screen('admin-settings', SettingsScreen),
    screen(
      'admin-presentation',
      () => import('./screens/PresentationScreen.vue'),
    ),
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundScreen,
      meta: { title: NOT_FOUND_TITLE },
    },
  ],
})

// A tab opened before a deploy asks for screens' files the deploy replaced;
// load the page afresh there rather than leave the tap without an answer.
router.onError((error, to) => {
  if (isStaleChunk(error)) reloadForStaleChunk(to.fullPath)
})
router.afterEach((to, _from, failure) => {
  if (failure !== undefined) return
  settledAfterReload()
  afterNavigation()
  showScreen(to.meta['title'] as string)
  reportScreen(to)
})

// No one is opted in before signing in, so a public screen is never counted.
function reportScreen(to: RouteLocationNormalized): void {
  if ((to.meta['access'] ?? 'public') === 'public') return
  reportEvent({ event: 'screen_viewed', props: { screen: String(to.name) } })
}

// A member already in who scans an event's code is taken home as ever, and
// the event's badge is theirs (R-BADGE-6).
function claimOnEntry(to: RouteLocationNormalized, me: Me | null): void {
  const invite = to.query['invite']
  if (to.path !== '/' || me?.onboarded !== true) return
  if (typeof invite === 'string' && invite !== '') claimEventBadge(invite)
}

router.beforeEach(async (to) => {
  if (to.name === 'not-found') return true

  const me = await loadMe()
  claimOnEntry(to, me)
  const decision = decide(
    {
      path: to.path,
      fullPath: to.fullPath,
      access: (to.meta['access'] as Access | undefined) ?? 'public',
      permission: to.meta['permission'] as string | undefined,
    },
    me,
    typedProfile() !== null,
  )

  if (decision.kind === 'redirect') return decision.to
  if (decision.kind === 'not-found') {
    return {
      name: 'not-found',
      params: { pathMatch: to.path.slice(1).split('/') },
      query: to.query,
      hash: to.hash,
      replace: true,
    }
  }
  // A link from a notification's email, opened by whoever may see it: that
  // is reported, and the mark leaves the address (R-ANA-1).
  const notice = fromNotice(to.query)
  if (notice === null) return true
  if (notice.kind !== null)
    reportEvent({
      event: 'notification_opened',
      props: { type: notice.kind, via: 'email' },
    })
  return { path: to.path, query: notice.rest, hash: to.hash, replace: true }
})
