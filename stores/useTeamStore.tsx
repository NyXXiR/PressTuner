// stores/useTeamStore.ts
import { create } from "zustand";

type TeamState = {
  selectedTeamId: string | null;
  setSelectedTeamId: (teamId: string | null) => void;
  hydrateFromStorage: () => void;
};

const STORAGE_KEY = "selectedTeamId";

export const useTeamStore = create<TeamState>((set) => ({
  selectedTeamId: null,

  setSelectedTeamId: (teamId) => {
    if (typeof window !== "undefined") {
      if (teamId) localStorage.setItem(STORAGE_KEY, teamId);
      else localStorage.removeItem(STORAGE_KEY);
    }
    set({ selectedTeamId: teamId });
  },

  hydrateFromStorage: () => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem(STORAGE_KEY);
    set({ selectedTeamId: saved ?? null });
  },
}));
