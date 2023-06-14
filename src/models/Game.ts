import { SummonerRawData } from "./Player";

export interface ParticipantRawData {
	summoner: SummonerRawData;
	participant_id: number;
	champion_id: number;
	team_key: string;
	position: 'TOP' | 'JUNGLE' | 'MID' | 'ADC' | 'SUPPORT';
	items: number[]; // ids
	trinket_item: number; // id
	rune: {
		primary_page_id: number;
		primary_rune_id: number;
		secondary_page_id: number;
	};
	spells: number[]; // ids
	stats: {
		champion_level: number;
		damage_self_mitigated: number;
		damage_dealt_to_objectives: number;
		damage_dealt_to_turrets: number;
		magic_damage_dealt_player: number;
		physical_damage_taken: number;
		physical_damage_dealt_to_champions: number;
		total_damage_taken: number;
		total_damage_dealt: number;
		total_damage_dealt_to_champions: number;
		largest_critical_strike: number;
		time_ccing_others: number;
		vision_score: number;
		vision_wards_bought_in_game: number;
		sight_wards_bought_in_game: number;
		ward_kill: number;
		ward_place: number;
		turret_kill: number;
		barrack_kill: number;
		kill: number;
		death: number;
		assist: number;
		largest_multi_kill: number;
		largest_killing_spree: number;
		minion_kill: number;
		neutral_minion_kill_team_jungle: number;
		neutral_minion_kill_enemy_jungle: number;
		neutral_minion_kill: number;
		gold_earned: number;
		total_heal: number;
		result: 'WIN' | 'LOSE' | 'UNKNOWN', // 'UNKNOWN' for remake
		op_score: number;
		op_score_rank: number;
		is_opscore_max_in_team: boolean;
	};
	tier_info: {
		tier: string;
		division: number;
		lp: number;
	};
}

export interface TeamRawData {
	key: 'BLUE' | 'RED';
	game_stat: {
		dragon_kill: number;
		baron_kill: number;
		tower_kill: number;
		is_remake: boolean;
		is_win: boolean;
		kill: number;
		death: number;
		assist: number;
		gold_earned: number;
	};
	banned_champions: number[];
}

export interface GameRawData {
	id: string;
	created_at: string; // date
	game_map: string;
	queue_info: {
		id: number;
		queue_translate: string;
		game_type: string;
	};
	version: string;
	game_length_second: number;
	is_remake: boolean;
	is_recorded: boolean;
	average_tier_info: {
		tier: string;
		division: number;
	};
	participants: ParticipantRawData[];
	teams: TeamRawData[];

	// TODO: details
}
