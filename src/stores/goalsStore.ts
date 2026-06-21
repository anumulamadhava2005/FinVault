import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type GoalFilterStatus = 'all' | 'completed' | 'on_track' | 'behind' | 'overdue';
type GoalSortBy = 'target_date' | 'pct' | 'name';

interface GoalsStore {
  view: 'cards' | 'focus';
  filterStatus: GoalFilterStatus;
  sortBy: GoalSortBy;
  searchQuery: string;
  setView: (v: 'cards' | 'focus') => void;
  setFilterStatus: (s: GoalFilterStatus) => void;
  setSortBy: (s: GoalSortBy) => void;
  setSearchQuery: (q: string) => void;
}

export const useGoalsStore = create<GoalsStore>()(
  persist(
    (set) => ({
      view: 'cards',
      filterStatus: 'all',
      sortBy: 'target_date',
      searchQuery: '',
      setView: (view) => set({ view }),
      setFilterStatus: (filterStatus) => set({ filterStatus }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSearchQuery: (searchQuery) => set({ searchQuery }),
    }),
    {
      name: 'goals-ui',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        view: state.view,
        filterStatus: state.filterStatus,
        sortBy: state.sortBy,
      }),
    },
  ),
);

export type { GoalFilterStatus, GoalSortBy };
