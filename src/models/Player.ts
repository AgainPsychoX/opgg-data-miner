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
	previous_seasons: {
		season_id: number;
		tier_info: {
			tier: string;
			division: number;
			lp?: number | null;
			tier_image_url: string;
			border_image_url: string;
		};
		created_at?: string | null; // date
	}[];
	league_stats: {
		queue_info: {
			id: number;
			queue_translate: string;
			game_type: string;
		},
		tier_info: {
			tier: string;
			division: number;
			lp: number;
			tier_image_url: string;
			border_image_url: string;
		},
		win: number;
		lose: number;
		is_hot_streak: boolean,
		is_fresh_blood: boolean,
		is_veteran: boolean,
		is_inactive: boolean,
		series: any,
		updated_at: string, // data
		league: {
			id: number,
			name: string,
			udid: string,
			translate: string;
		}
	}[];
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
