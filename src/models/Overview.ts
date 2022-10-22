
export interface ParticipantOverview {
	summonerName: string;
	rankedTier: string;

	championName: string;
	summonerSpells: string[];
	keystoneRune: string;
	primaryRuneTree: string;
	secondaryRuneTree: string;
	items: string[];
	totalItemsPrice: number;

	level: number;
	creepScore: number;
	kills: number;
	deaths: number;
	assists: number;
	killParticipationSummaryPercent: number;
	damage: number;
	controlWards: number;
	wardsPlaced: number;
	wardsKilled: number;

	opScore: number;
	hasACE: boolean;
	hasMVP: boolean;
}

export interface TeamOverview {
	victory: boolean;
	participants: ParticipantOverview[];
	barons: number;
	dragons: number;
	towers: number;
	totalKills: number;
	totalGold: number;
}

export interface MatchOverview {
	gameId: number;
	timestamp: Date;
	type: string;
	result: string;
	duration: number;
	tierAverage: string;

	redTeam: TeamOverview;
	blueTeam: TeamOverview;
}