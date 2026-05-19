export type MessageType =
  | 'START_TRANSLATION'
  | 'STOP_TRANSLATION'
  | 'SETTINGS_UPDATED'
  | 'GET_STATUS';

export interface ExtensionMessage {
  type: MessageType;
}

export interface StatusResponse {
  isRunning: boolean;
}
