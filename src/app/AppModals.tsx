import VoiceModal from '../components/VoiceModal';
import StreamModal from '../components/StreamModal';
import AddServerModal from '../components/AddServerModal';
import AccountModal from '../components/AccountModal';
import ServerSettingsModal from '../components/ServerSettingsModal';
import DevPanel from '../components/DevPanel';
import StatusBanner from '../components/StatusBanner';
import ScreenShareOverlay from '../components/ScreenShareOverlay';
import ScreenPickerModal from '../components/ScreenPickerModal';

interface AppModalsProps {
  voiceModalOpen: boolean;
  voiceState: React.ComponentProps<typeof VoiceModal>['state'];
  onLeaveVoice: () => Promise<void>;
  onCloseVoiceModal: () => void;

  streamModalOpen: boolean;
  streamState: React.ComponentProps<typeof StreamModal>['state'];
  onStopStream: () => Promise<void>;
  onToggleStreamMute: () => void;
  onCloseStreamModal: () => void;

  addServerOpen: boolean;
  onCloseAddServer: () => void;
  onServerAdded: () => void;

  accountOpen: boolean;
  onCloseAccount: () => void;
  onAccountLogout: () => void;
  onAccountDm: () => void;
  onAccountSwitchServer: (url: string, name: string) => void;
  onOpenDevPanel: () => void;

  serverSettingsOpen: boolean;
  serverName: string;
  serverSettingsTab: 'overview' | 'categories' | 'roles' | 'invites';
  onCloseServerSettings: () => void;
  onRefreshServerSettings: () => Promise<void>;

  devPanelOpen: boolean;
  onCloseDevPanel: () => void;

  remoteFrames: React.ComponentProps<typeof ScreenShareOverlay>['frames'];
  showScreenPicker: boolean;
  onStartScreenCapture: (sourceId: string) => void;

  healthStatus: React.ComponentProps<typeof StatusBanner>['status'];
}

export default function AppModals({
  voiceModalOpen, voiceState, onLeaveVoice, onCloseVoiceModal,
  streamModalOpen, streamState, onStopStream, onToggleStreamMute, onCloseStreamModal,
  addServerOpen, onCloseAddServer, onServerAdded,
  accountOpen, onCloseAccount, onAccountLogout, onAccountDm, onAccountSwitchServer, onOpenDevPanel,
  serverSettingsOpen, serverName, serverSettingsTab, onCloseServerSettings, onRefreshServerSettings,
  devPanelOpen, onCloseDevPanel,
  remoteFrames, showScreenPicker, onStartScreenCapture,
  healthStatus,
}: AppModalsProps) {
  return (
    <>
      <ScreenShareOverlay frames={remoteFrames} />
      {showScreenPicker && (
        <ScreenPickerModal
          onShare={onStartScreenCapture}
          onClose={() => onStartScreenCapture('')}
        />
      )}
      {voiceModalOpen && (
        <VoiceModal
          state={voiceState}
          onLeave={onLeaveVoice}
          onClose={onCloseVoiceModal}
        />
      )}
      {streamModalOpen && (
        <StreamModal
          state={streamState}
          onStop={onStopStream}
          onToggleMute={onToggleStreamMute}
          onClose={onCloseStreamModal}
        />
      )}
      {addServerOpen && (
        <AddServerModal
          onClose={onCloseAddServer}
          onAdded={onServerAdded}
        />
      )}
      {accountOpen && (
        <AccountModal
          onClose={onCloseAccount}
          onLogout={onAccountLogout}
          onDm={onAccountDm}
          onSwitchServer={onAccountSwitchServer}
          onOpenDevPanel={onOpenDevPanel}
        />
      )}
      {serverSettingsOpen && (
        <ServerSettingsModal
          serverName={serverName}
          initialTab={serverSettingsTab}
          onClose={onCloseServerSettings}
          onRefresh={onRefreshServerSettings}
        />
      )}
      {devPanelOpen && (
        <DevPanel onClose={onCloseDevPanel} />
      )}
      <StatusBanner status={healthStatus} />
    </>
  );
}
