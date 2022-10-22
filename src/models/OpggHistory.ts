import { MatchSummary } from "./Summary";
import { MatchOverview } from "./Overview";

export type MatchAnyDetailLevel = MatchSummary | MatchOverview;

export interface OpggHistory {
	updateTime: Date,
	summonerName: string;
	summonerLevel: number;

	// Current season summary
	summary: {
		rankedTier: string;
		wins: number;
		loses: number;
	}

	// TODO: past seasons and stuff

	matches: MatchAnyDetailLevel[];
}
