
export interface ParticipantMinimal {
	summonerName: string;
	championName: string;
}

export interface ParticipantSummary extends ParticipantMinimal {
	summonerSpells: string[];
	runes: string[];
	items: string[];

	level: number;
	creepScore: number;
	kills: number;
	deaths: number;
	assists: number;
	killParticipationSummaryPercent: number;
	controlWards: number;

	maxMultiKill: number;
	hasACE: boolean;
	basMVP: boolean;
}

/**
 * Participant entry from perspective of account 
 */
export interface ParticipantSummarySelf extends ParticipantSummary {
	summonerId: number;
}

export type ParticipantAnyDetalLevel = ParticipantMinimal | ParticipantSummarySelf;

export interface TeamSummary {
	victory: boolean;
	participants: ParticipantAnyDetalLevel[];
}

export interface MatchSummary {
	gameId: number;
	timestamp: Date;
	type: string;
	result: string;
	duration: number;

	// Average tier is only calculated in ranked games
	tierAverage?: string;

	redTeam: TeamSummary;
	blueTeam: TeamSummary;
}

