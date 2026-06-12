export interface StatusUpdate {
  text: string
  type: 'info' | 'success' | 'warning' | 'error'
}

export interface StatusPanelProps {
  statusUpdates: StatusUpdate[];
}
