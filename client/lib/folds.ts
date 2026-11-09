import { computed, ref, type ComputedRef, type Ref } from 'vue'

const SEARCH_MIN_CHARS = 3

/** What a search looks for, in lower case; null until it holds three
 * characters, so one typed letter does not match nearly everything
 * (R-CFG-5, R-PROF-8). */
export function searchTerm(search: string): string | null {
  const needle = search.trim().toLowerCase()
  return needle.length < SEARCH_MIN_CHARS ? null : needle
}

/** Whether `text` holds a search term, ignoring case. */
export function holds(text: string, needle: string): boolean {
  return text.toLowerCase().includes(needle)
}

/** A screen of folded cards under a search, as the host settings and the
 * profile screen have them (R-CFG-5, R-PROF-8). */
export type Folds = {
  search: Ref<string>
  searching: ComputedRef<boolean>
  isOpen: (title: string) => boolean
  remember: (title: string, open: boolean) => void
}

/** The state of a screen's folds: a search opens what it finds, and only the
 * member's own opening and closing is remembered, so clearing the search
 * folds the screen back as they left it. */
export function useFolds(): Folds {
  const search = ref('')
  const opened = ref(new Set<string>())
  const searching = computed(() => searchTerm(search.value) !== null)

  function remember(title: string, open: boolean): void {
    if (searching.value) return
    const next = new Set(opened.value)
    if (open) next.add(title)
    else next.delete(title)
    opened.value = next
  }

  return {
    search,
    searching,
    isOpen: (title) => searching.value || opened.value.has(title),
    remember,
  }
}
