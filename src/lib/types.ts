export type QuestionStatus = "live" | "answered" | "hidden";

export type EventRow = {
  id: string;
  organizer_id: string;
  code: string;
  title: string;
  description: string | null;
  is_open: boolean;
  created_at: string;
  updated_at: string;
};

/** Event fields exposed through the public-code RPCs. */
export type PublicEvent = Pick<EventRow, "id" | "code" | "title" | "description" | "is_open" | "created_at">;

export type EventParticipantRow = {
  event_id: string;
  user_id: string;
  joined_at: string;
  last_seen_at: string;
};

export type QuestionGroupRow = {
  id: string;
  event_id: string;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
};

export type QuestionRow = {
  id: string;
  event_id: string;
  group_id: string | null;
  author_id: string;
  author_name: string | null;
  body: string;
  status: QuestionStatus;
  is_pinned: boolean;
  upvotes: number;
  created_at: string;
  updated_at: string;
  answered_at: string | null;
};

export type QuestionVoteRow = {
  question_id: string;
  event_id: string;
  user_id: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      events: {
        Row: EventRow;
        Insert: Partial<EventRow> & Pick<EventRow, "title">;
        Update: Partial<EventRow>;
        Relationships: [];
      };
      event_participants: {
        Row: EventParticipantRow;
        Insert: Partial<EventParticipantRow> & Pick<EventParticipantRow, "event_id" | "user_id">;
        Update: Partial<EventParticipantRow>;
        Relationships: [
          {
            foreignKeyName: "event_participants_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      question_groups: {
        Row: QuestionGroupRow;
        Insert: Partial<QuestionGroupRow> & Pick<QuestionGroupRow, "event_id" | "name">;
        Update: Partial<QuestionGroupRow>;
        Relationships: [
          {
            foreignKeyName: "question_groups_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
        ];
      };
      questions: {
        Row: QuestionRow;
        Insert: Partial<QuestionRow> & Pick<QuestionRow, "event_id" | "body">;
        Update: Partial<QuestionRow>;
        Relationships: [
          {
            foreignKeyName: "questions_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questions_group_fk";
            columns: ["group_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "question_groups";
            referencedColumns: ["id", "event_id"];
          },
        ];
      };
      question_votes: {
        Row: QuestionVoteRow;
        Insert: Partial<QuestionVoteRow> & Pick<QuestionVoteRow, "question_id">;
        Update: Partial<QuestionVoteRow>;
        Relationships: [
          {
            foreignKeyName: "question_votes_question_fk";
            columns: ["question_id", "event_id"];
            isOneToOne: false;
            referencedRelation: "questions";
            referencedColumns: ["id", "event_id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_event_by_code: { Args: { p_code: string }; Returns: PublicEvent[] };
      join_event: { Args: { p_code: string }; Returns: PublicEvent[] };
      submit_question: {
        Args: {
          p_event_code: string;
          p_body: string;
          p_author_name?: string | null;
          p_group_id?: string | null;
        };
        Returns: QuestionRow;
      };
      toggle_vote: {
        Args: { p_question_id: string };
        Returns: { voted: boolean; upvotes: number }[];
      };
    };
    Enums: { question_status: QuestionStatus };
    CompositeTypes: Record<string, never>;
  };
};
