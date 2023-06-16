import { Region } from "@/common";

export interface SummonerRawData {
	id: number;
	summoner_id: string;
	acct_id: string;
	puuid: string;
	region: Region; // should be added when loading
	name: string;
	internal_name: string;
	profile_image_url: string;
	level: number;
	updated_at: string; // date
}

export interface PlayerRawData extends SummonerRawData {
	renewable_at: string; // date
	lp_histories: {
		created_at: string; // data
		tier_info: {
			tier: string;
			division: number;
			lp: number;
		};
		elo_point: number;
	}[];
	previous_seasons: any[];
	league_stats: any[];
	most_champions: {
		game_type: string;
		season_id: number;
		play: number;
		win: number;
		lose: number;
		champion_stats: any[];
	}
	recent_champion_stats: {
		id: number;
		play: number;
		win: number;
		kill: number;
		death: number;
		assist: number;
	}[];
	ladder_rank: {
		rank: number;
		total: number;
	}
	// TODO: more detailed
}
