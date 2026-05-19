import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Send, Loader2, Users, MessageSquare, ImagePlus, X, ChevronLeft, ChevronRight, ArrowLeft, Plus, Phone, Hash, User, Check, CheckCheck } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { cn } from "@/lib/utils";
import { useTeamCall } from "@/hooks/use-team-call";
import { TeamCallUI } from "@/components/TeamCallUI";

const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
const URL_TEST = /^https?:\/\//i;

function linkifyMessage(text: string, isOwn: boolean) {
  const parts = text.split(URL_REGEX);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (URL_TEST.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "underline break-all",
            isOwn ? "text-primary-foreground/90 hover:text-primary-foreground" : "text-primary hover:text-primary/80"
          )}
          data-testid={`link-team-msg-${i}`}
        >
          {part.length > 60 ? part.slice(0, 57) + "..." : part}
        </a>
      );
    }
    return part;
  });
}

interface TeamMember {
  id: string;
  companyUserId: number | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
  profileImageUrl: string | null;
  role: string;
  status: string;
}

interface ReadByEntry {
  userId: string;
  readAt: string | null;
}

interface TeamMessageWithSender {
  id: number;
  companyOwnerId: string;
  senderId: string;
  recipientId: string | null;
  channel: string;
  channelId: number | null;
  message: string;
  imageUrl: string | null;
  isRead: boolean;
  readBy?: ReadByEntry[];
  createdAt: string;
  sender: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    profileImageUrl: string | null;
  } | null;
}

interface ChannelMember {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  profileImageUrl: string | null;
}

interface EnrichedChannel {
  id: number;
  companyOwnerId: string;
  name: string | null;
  type: string;
  createdById: string;
  memberIds: string[];
  members: ChannelMember[];
  lastMessage: TeamMessageWithSender | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

function parseImageUrls(imageUrl: string | null): string[] {
  if (!imageUrl) return [];
  try {
    const parsed = JSON.parse(imageUrl);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return [imageUrl];
}

function getMemberName(member: { firstName: string | null; lastName: string | null; email: string }): string {
  if (member.firstName || member.lastName) {
    return [member.firstName, member.lastName].filter(Boolean).join(" ");
  }
  if (member.email && !member.email.match(/^[0-9a-f]{8}-/)) {
    return member.email;
  }
  return "Team Member";
}

function getMemberInitials(member: { firstName: string | null; lastName: string | null; email: string }): string {
  const f = member.firstName?.[0] || "";
  const l = member.lastName?.[0] || "";
  if (f || l) return (f + l).toUpperCase();
  return member.email?.[0]?.toUpperCase() || "?";
}

function formatMessageTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday";
  return format(date, "M/d");
}

function formatFullTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (isToday(date)) return format(date, "h:mm a");
  if (isYesterday(date)) return "Yesterday " + format(date, "h:mm a");
  return format(date, "M/d h:mm a");
}

function getChannelDisplayName(channel: EnrichedChannel, currentUserId: string): string {
  if (channel.type === "general") return "General";
  if (channel.name) return channel.name;
  if (channel.type === "direct") {
    const other = channel.members.find(m => m.id !== currentUserId);
    return other ? getMemberName(other) : "Direct Message";
  }
  const others = channel.members.filter(m => m.id !== currentUserId);
  if (others.length <= 3) return others.map(m => getMemberName(m).split(" ")[0]).join(", ");
  return `${others.slice(0, 2).map(m => getMemberName(m).split(" ")[0]).join(", ")} +${others.length - 2}`;
}

function getChannelAvatar(channel: EnrichedChannel, currentUserId: string) {
  if (channel.type === "general") {
    return (
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
        <Hash className="w-5 h-5 text-primary" />
      </div>
    );
  }
  if (channel.type === "direct") {
    const other = channel.members.find(m => m.id !== currentUserId);
    return (
      <Avatar className="w-10 h-10 shrink-0">
        <AvatarImage src={other?.profileImageUrl || undefined} />
        <AvatarFallback className="text-sm">{other ? getMemberInitials(other) : "?"}</AvatarFallback>
      </Avatar>
    );
  }
  return (
    <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
      <Users className="w-5 h-5 text-blue-500" />
    </div>
  );
}

interface FullscreenGalleryProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

function FullscreenGallery({ images, initialIndex, onClose }: FullscreenGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  useEffect(() => {
    const updateHeight = () => setViewportHeight(window.innerHeight);
    updateHeight();
    window.addEventListener("resize", updateHeight);
    if (window.visualViewport) window.visualViewport.addEventListener("resize", updateHeight);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCurrentIndex(i => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setCurrentIndex(i => Math.min(images.length - 1, i + 1));
    };
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", updateHeight);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", updateHeight);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [images.length, onClose]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50) {
      if (dx < 0 && currentIndex < images.length - 1) setCurrentIndex(currentIndex + 1);
      if (dx > 0 && currentIndex > 0) setCurrentIndex(currentIndex - 1);
    }
    if (Math.abs(dy) > 100 && Math.abs(dy) > Math.abs(dx)) onClose();
    touchStartX.current = null; touchStartY.current = null;
  };

  return (
    <div className="fixed left-0 right-0 top-0 z-[100] bg-black flex flex-col" style={{ height: `${viewportHeight}px` }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} data-testid="fullscreen-gallery">
      <div className="flex items-center justify-between px-4 py-2 shrink-0 bg-black/80 z-10">
        <span className="text-white/80 text-sm font-medium">{images.length > 1 ? `${currentIndex + 1} / ${images.length}` : ""}</span>
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center text-white" data-testid="button-close-fullscreen"><X className="w-7 h-7" /></button>
      </div>
      <div className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0">
        {images.length > 1 && currentIndex > 0 && (
          <button onClick={(e) => { e.stopPropagation(); setCurrentIndex(currentIndex - 1); }} className="absolute left-2 z-10 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60" data-testid="button-prev-image"><ChevronLeft className="w-6 h-6" /></button>
        )}
        <img src={images[currentIndex]} alt={`Image ${currentIndex + 1}`} className="max-w-full max-h-full object-contain select-none" draggable={false} />
        {images.length > 1 && currentIndex < images.length - 1 && (
          <button onClick={(e) => { e.stopPropagation(); setCurrentIndex(currentIndex + 1); }} className="absolute right-2 z-10 w-10 h-10 rounded-full bg-black/40 flex items-center justify-center text-white hover:bg-black/60" data-testid="button-next-image"><ChevronRight className="w-6 h-6" /></button>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-2 py-3 shrink-0 bg-black/80 z-10">
          {images.map((_, i) => (
            <button key={i} onClick={() => setCurrentIndex(i)} className={cn("w-2 h-2 rounded-full transition-all", i === currentIndex ? "bg-white w-3" : "bg-white/40")} data-testid={`dot-image-${i}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationList({ channels, currentUserId, selectedChannelId, onSelectChannel, onNewChat, isLoading, canCreateChat = true }: {
  channels: EnrichedChannel[];
  currentUserId: string;
  selectedChannelId: number | null;
  onSelectChannel: (id: number) => void;
  onNewChat: () => void;
  isLoading: boolean;
  canCreateChat?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b flex items-center justify-between">
        <h3 className="font-semibold text-base">Team Chat</h3>
        {canCreateChat !== false && (
          <Button variant="ghost" size="icon" onClick={onNewChat} className="h-8 w-8" data-testid="button-new-chat">
            <Plus className="w-4 h-4" />
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <MessageSquare className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No conversations yet</p>
          </div>
        ) : (
          channels.map(channel => {
            const displayName = getChannelDisplayName(channel, currentUserId);
            const lastMsg = channel.lastMessage;
            let preview = "";
            if (lastMsg) {
              const senderName = lastMsg.senderId === currentUserId ? "You" : (lastMsg.sender ? getMemberName(lastMsg.sender).split(" ")[0] : "");
              const msgText = lastMsg.imageUrl && !lastMsg.message ? "📷 Photo" : lastMsg.message;
              preview = channel.type === "direct" ? (lastMsg.senderId === currentUserId ? `You: ${msgText}` : msgText) : `${senderName}: ${msgText}`;
              if (preview.length > 50) preview = preview.slice(0, 50) + "...";
            }

            return (
              <button
                key={channel.id}
                onClick={() => onSelectChannel(channel.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b border-muted/30",
                  selectedChannelId === channel.id && "bg-muted"
                )}
                data-testid={`channel-item-${channel.id}`}
              >
                {getChannelAvatar(channel, currentUserId)}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate">{displayName}</span>
                    {lastMsg && <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{formatMessageTime(lastMsg.createdAt)}</span>}
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">{preview || "No messages yet"}</p>
                    {channel.unreadCount > 0 && (
                      <Badge className="ml-2 h-5 min-w-5 flex items-center justify-center text-[10px] rounded-full shrink-0 px-1.5" data-testid={`badge-unread-${channel.id}`}>
                        {channel.unreadCount > 99 ? "99+" : channel.unreadCount}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function MessageThread({ channelId, channel, currentUserId, onBack, onCall, onConferenceCall, canSend, canCall }: {
  channelId: number;
  channel: EnrichedChannel | undefined;
  currentUserId: string;
  onBack: () => void;
  onCall: (userId: string) => void;
  onConferenceCall: (userIds: string[]) => void;
  canSend?: boolean;
  canCall?: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [messageText, setMessageText] = useState("");
  const [selectedImages, setSelectedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [galleryImages, setGalleryImages] = useState<string[] | null>(null);
  const [galleryStartIndex, setGalleryStartIndex] = useState(0);
  const [showCallPicker, setShowCallPicker] = useState(false);
  const [seenByMessage, setSeenByMessage] = useState<TeamMessageWithSender | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: messages = [], isLoading } = useQuery<TeamMessageWithSender[]>({
    queryKey: ["/api/team/channels", channelId, "messages"],
    queryFn: async () => {
      const res = await fetch(`/api/team/channels/${channelId}/messages`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch messages");
      return res.json();
    },
    enabled: !!channelId,
    staleTime: 5000,
    refetchOnMount: "always",
  });

  useEffect(() => {
    if (channelId) {
      queryClient.setQueryData<EnrichedChannel[]>(["/api/team/channels"], (old) => {
        if (!old) return old;
        return old.map(ch => ch.id === channelId ? { ...ch, unreadCount: 0 } : ch);
      });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"], refetchType: "all" });
      apiRequest("POST", `/api/team/channels/${channelId}/mark-read`)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread"], refetchType: "all" });
          queryClient.invalidateQueries({ queryKey: ["/api/team/channels"], refetchType: "all" });
        })
        .catch(() => {});
    }
  }, [channelId, messages.length]);

  const sendMutation = useMutation({
    mutationFn: async (data: { message: string; imageUrl?: string }) => {
      const res = await apiRequest("POST", `/api/team/channels/${channelId}/messages`, {
        message: data.message,
        imageUrl: data.imageUrl,
      });
      return res.json();
    },
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["/api/team/channels", channelId, "messages"] });
      const previousMessages = queryClient.getQueryData<TeamMessageWithSender[]>(["/api/team/channels", channelId, "messages"]);
      const optimisticMessage: TeamMessageWithSender = {
        id: -Date.now(),
        companyOwnerId: "",
        senderId: currentUserId,
        recipientId: null,
        channel: "",
        channelId,
        message: data.message,
        imageUrl: data.imageUrl || null,
        isRead: false,
        readBy: [],
        createdAt: new Date().toISOString(),
        sender: { id: currentUserId, firstName: null, lastName: null, email: "", profileImageUrl: null },
      };
      queryClient.setQueryData<TeamMessageWithSender[]>(
        ["/api/team/channels", channelId, "messages"],
        (old = []) => [optimisticMessage, ...old]
      );
      return { previousMessages };
    },
    onError: (err: any, data, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(["/api/team/channels", channelId, "messages"], context.previousMessages);
      }
      setMessageText(prev => prev.trim() ? prev : (data.message || ""));
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    },
    onSuccess: (serverMsg) => {
      if (serverMsg?.id) {
        queryClient.setQueryData<TeamMessageWithSender[]>(
          ["/api/team/channels", channelId, "messages"],
          (old = []) => {
            const idx = old.findIndex(m => m.id < 0);
            if (idx >= 0) {
              const updated = [...old];
              updated[idx] = { ...serverMsg, readBy: serverMsg.readBy || [] };
              return updated;
            }
            return old;
          }
        );
      }
      queryClient.invalidateQueries({ queryKey: ["/api/team/channels"] });
      if (textareaRef.current) {
        textareaRef.current.focus();
      }
    },
    onSettled: () => {
    },
  });

  const sortedMessages = [...(Array.isArray(messages) ? messages : [])].reverse();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages.length]);

  const openGallery = useCallback((msgImages: string[], clickedIndex: number) => {
    setGalleryImages(msgImages);
    setGalleryStartIndex(clickedIndex);
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const validFiles: File[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) { toast({ title: "Only images allowed", variant: "destructive" }); continue; }
      if (file.size > 10 * 1024 * 1024) { toast({ title: `${file.name} too large`, description: "Max 10MB", variant: "destructive" }); continue; }
      validFiles.push(file);
    }
    if (selectedImages.length + validFiles.length > 10) { toast({ title: "Max 10 images per message", variant: "destructive" }); return; }
    setSelectedImages(prev => [...prev, ...validFiles]);
    for (const file of validFiles) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreviews(prev => [...prev, ev.target?.result as string]);
      reader.readAsDataURL(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedImage = (index: number) => {
    setSelectedImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const uploadSingleImage = async (file: File): Promise<string> => {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const res = await fetch("/api/team/messages/upload-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageData: base64, contentType: file.type }),
      credentials: "include",
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.imageUrl;
  };

  const handleSend = async () => {
    if ((!messageText.trim() && selectedImages.length === 0) || sendMutation.isPending || isUploading) return;
    let imageUrlValue: string | undefined;
    if (selectedImages.length > 0) {
      setIsUploading(true);
      setUploadProgress(0);
      try {
        const urls: string[] = [];
        for (let i = 0; i < selectedImages.length; i++) {
          setUploadProgress(Math.round((i / selectedImages.length) * 100));
          urls.push(await uploadSingleImage(selectedImages[i]));
        }
        setUploadProgress(100);
        imageUrlValue = urls.length === 1 ? urls[0] : JSON.stringify(urls);
      } catch (err: any) {
        toast({ title: "Upload failed", description: err.message, variant: "destructive" });
        setIsUploading(false);
        setUploadProgress(0);
        return;
      }
      setIsUploading(false);
    }
    const msgToSend = messageText.trim() || "";
    setMessageText("");
    setSelectedImages([]);
    setImagePreviews([]);
    setUploadProgress(0);
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px";
    }
    sendMutation.mutate({ message: msgToSend, imageUrl: imageUrlValue });
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessageText(e.target.value);
    const textarea = e.target;
    textarea.style.height = "40px";
    const newHeight = Math.min(textarea.scrollHeight, 120);
    textarea.style.height = `${newHeight}px`;
  };

  const displayName = channel ? getChannelDisplayName(channel, currentUserId) : "Chat";
  const otherMembers = channel?.members.filter(m => m.id !== currentUserId) || [];
  const callTargetId = channel?.type === "direct" ? otherMembers[0]?.id : null;

  const handleCallClick = () => {
    if (callTargetId) {
      onCall(callTargetId);
    } else if (otherMembers.length > 0) {
      setShowCallPicker(true);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2.5 border-b bg-card flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="lg:hidden h-8 w-8 shrink-0" data-testid="button-back-to-channels">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {channel && getChannelAvatar(channel, currentUserId)}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate">{displayName}</h3>
            <p className="text-[11px] text-muted-foreground">
              {channel?.type === "general" ? "All team members" : channel?.members.length === 2 ? "Direct message" : `${channel?.members.length || 0} members`}
            </p>
          </div>
        </div>
        {otherMembers.length > 0 && canCall !== false && (
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-green-600" onClick={handleCallClick} data-testid="button-call-member">
            <Phone className="w-4 h-4" />
          </Button>
        )}
      </div>

      <Dialog open={showCallPicker} onOpenChange={setShowCallPicker}>
        <DialogContent className="max-w-xs" data-testid="dialog-call-picker">
          <DialogHeader>
            <DialogTitle>Call Team</DialogTitle>
          </DialogHeader>
          <div className="mt-2">
            {otherMembers.length > 1 && (
              <button
                onClick={() => { setShowCallPicker(false); onConferenceCall(otherMembers.map(m => m.id)); }}
                className="w-full flex items-center gap-3 p-3 rounded-lg bg-green-600/10 hover:bg-green-600/20 transition-colors text-left mb-2 border border-green-600/20"
                data-testid="button-call-all"
              >
                <div className="w-9 h-9 rounded-full bg-green-600/20 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-green-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">Conference Call</p>
                  <p className="text-[11px] text-muted-foreground">Call all {otherMembers.length} members</p>
                </div>
                <Phone className="w-4 h-4 text-green-600 shrink-0" />
              </button>
            )}
            <p className="text-xs text-muted-foreground mb-1.5 px-1">Or call individually:</p>
            <div className="space-y-0.5 max-h-52 overflow-y-auto">
              {otherMembers.map(member => (
                <button
                  key={member.id}
                  onClick={() => { setShowCallPicker(false); onCall(member.id); }}
                  className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/50 transition-colors text-left"
                  data-testid={`call-member-${member.id}`}
                >
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={member.profileImageUrl || undefined} />
                    <AvatarFallback className="text-xs">{getMemberInitials(member)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{getMemberName(member)}</p>
                  </div>
                  <Phone className="w-4 h-4 text-green-600 shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-full"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : sortedMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <MessageSquare className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="font-medium text-muted-foreground">No messages yet</h3>
            <p className="text-sm text-muted-foreground/70 mt-1">Start the conversation!</p>
          </div>
        ) : (
          <>
            {sortedMessages.map((msg, i) => {
              const isOwn = msg.senderId === currentUserId;
              const showAvatar = i === 0 || sortedMessages[i - 1]?.senderId !== msg.senderId;
              const msgImages = parseImageUrls(msg.imageUrl);
              const hasImages = msgImages.length > 0;
              const hasText = msg.message && msg.message !== "Sent an image" && msg.message.trim() !== "";

              return (
                <div
                  key={msg.id}
                  className={cn("flex gap-2", isOwn ? "flex-row-reverse" : "flex-row", !showAvatar && (isOwn ? "mr-10" : "ml-10"))}
                  data-testid={`team-message-${msg.id}`}
                >
                  {showAvatar && (
                    <Avatar className="w-8 h-8 shrink-0 mt-1">
                      <AvatarImage src={msg.sender?.profileImageUrl || undefined} />
                      <AvatarFallback className="text-xs">{msg.sender ? getMemberInitials(msg.sender) : "?"}</AvatarFallback>
                    </Avatar>
                  )}
                  <div className={cn("max-w-[75%]", isOwn ? "text-right" : "text-left")}>
                    {showAvatar && (
                      <p className={cn("text-xs text-muted-foreground mb-0.5 px-1", isOwn ? "text-right" : "text-left")}>
                        {isOwn ? "You" : (msg.sender ? getMemberName(msg.sender) : "Unknown")}
                      </p>
                    )}
                    <div className={cn("inline-block rounded-2xl text-sm overflow-hidden", !hasImages && "px-3.5 py-2", isOwn ? "bg-primary text-primary-foreground rounded-tr-sm" : "bg-muted rounded-tl-sm")}>
                      {hasImages && (
                        <div className={cn("p-1", msgImages.length === 1 ? "" : "grid gap-1", msgImages.length === 2 ? "grid-cols-2" : "", msgImages.length >= 3 ? "grid-cols-2" : "")}>
                          {msgImages.map((url, imgIdx) => (
                            <img
                              key={imgIdx}
                              src={url}
                              alt={`Image ${imgIdx + 1}`}
                              className={cn("object-cover cursor-pointer rounded-xl", msgImages.length === 1 ? "max-w-[260px] max-h-[300px]" : "w-full h-[120px]", msgImages.length === 3 && imgIdx === 2 ? "col-span-2 h-[140px]" : "")}
                              onClick={() => openGallery(msgImages, imgIdx)}
                              data-testid={`team-image-${msg.id}-${imgIdx}`}
                            />
                          ))}
                        </div>
                      )}
                      {hasText && <div className={cn(hasImages ? "px-3.5 py-2" : "")}>{linkifyMessage(msg.message!, isOwn)}</div>}
                    </div>
                    <div className={cn("flex items-center gap-1 mt-0.5 px-1", isOwn ? "justify-end" : "justify-start")}>
                      <p className="text-[10px] text-muted-foreground/60">{formatFullTime(msg.createdAt)}</p>
                      {isOwn && (() => {
                        const othersWhoRead = (msg.readBy || []).filter(r => r.userId !== currentUserId);
                        const isSeen = othersWhoRead.length > 0;
                        if (isSeen) {
                          return (
                            <button
                              onClick={() => setSeenByMessage(msg)}
                              className="inline-flex items-center gap-0.5 hover:opacity-70 transition-opacity"
                              data-testid={`button-seen-by-${msg.id}`}
                            >
                              <CheckCheck className="w-3 h-3 text-blue-500" />
                            </button>
                          );
                        }
                        return <Check className="w-3 h-3 text-muted-foreground/50" />;
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {imagePreviews.length > 0 && (
        <div className="px-4 py-2 border-t bg-muted/50">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {imagePreviews.map((preview, idx) => (
              <div key={idx} className="relative shrink-0">
                <img src={preview} alt={`Preview ${idx + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                <button onClick={() => removeSelectedImage(idx)} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center shadow-sm" data-testid={`button-remove-image-${idx}`}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {selectedImages.length < 10 && (
              <button onClick={() => fileInputRef.current?.click()} className="h-16 w-16 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center shrink-0 hover:border-primary/50" data-testid="button-add-more-images">
                <ImagePlus className="w-5 h-5 text-muted-foreground/50" />
              </button>
            )}
          </div>
          {isUploading && (
            <div className="mt-1.5">
              <div className="h-1 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }} /></div>
              <p className="text-[10px] text-muted-foreground mt-0.5">Uploading {uploadProgress}%</p>
            </div>
          )}
        </div>
      )}

      {canSend !== false ? (
        <div className="border-t bg-card px-4 py-3">
          <div className="flex items-end gap-2">
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} data-testid="input-team-image" />
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sendMutation.isPending || isUploading} className="shrink-0 mb-0.5" data-testid="button-attach-image">
              <ImagePlus className="w-5 h-5 text-muted-foreground" />
            </Button>
            <Textarea
              ref={textareaRef}
              placeholder="Type a message..."
              value={messageText}
              onChange={handleTextareaChange}
              disabled={isUploading}
              className="flex-1 min-h-[40px] max-h-[120px] resize-none overflow-y-auto py-2"
              style={{ height: "40px" }}
              rows={1}
              data-testid="input-team-message"
            />
            <Button size="icon" onClick={handleSend} disabled={(!messageText.trim() && selectedImages.length === 0) || isUploading} className="shrink-0 mb-0.5" data-testid="button-send-team-message">
              {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t bg-card px-4 py-3 text-center">
          <p className="text-sm text-muted-foreground">You don't have permission to send messages</p>
        </div>
      )}

      {galleryImages && (
        <FullscreenGallery images={galleryImages} initialIndex={galleryStartIndex} onClose={() => { setGalleryImages(null); setGalleryStartIndex(0); }} />
      )}

      <Dialog open={!!seenByMessage} onOpenChange={() => setSeenByMessage(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="text-base">Seen by</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {seenByMessage && (() => {
              const othersWhoRead = (seenByMessage.readBy || []).filter(r => r.userId !== currentUserId);
              if (othersWhoRead.length === 0) return <p className="text-sm text-muted-foreground">No one has seen this yet</p>;
              const memberMap: Record<string, ChannelMember> = {};
              for (const m of channel?.members || []) memberMap[m.id] = m;
              return othersWhoRead.map(r => {
                const member = memberMap[r.userId];
                const name = member ? `${member.firstName || ""} ${member.lastName || ""}`.trim() || member.email : r.userId;
                const initials = member?.firstName ? member.firstName[0].toUpperCase() : "?";
                return (
                  <div key={r.userId} className="flex items-center gap-3" data-testid={`seen-by-${r.userId}`}>
                    <Avatar className="h-8 w-8">
                      {member?.profileImageUrl && <AvatarImage src={member.profileImageUrl} />}
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{name}</p>
                      {r.readAt && (
                        <p className="text-[10px] text-muted-foreground">{format(new Date(r.readAt), "MMM d, h:mm a")}</p>
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewChatDialog({ open, onClose, teamMembers, currentUserId, onCreateChannel }: {
  open: boolean;
  onClose: () => void;
  teamMembers: TeamMember[];
  currentUserId: string;
  onCreateChannel: (memberIds: string[], name?: string) => void;
}) {
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [groupName, setGroupName] = useState("");

  const otherMembers = teamMembers.filter(m => m.id !== currentUserId);
  const isGroup = selectedMembers.length > 1;

  const handleCreate = () => {
    if (selectedMembers.length === 0) return;
    onCreateChannel(selectedMembers, isGroup ? groupName.trim() || undefined : undefined);
    setSelectedMembers([]);
    setGroupName("");
    onClose();
  };

  const toggleMember = (id: string) => {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" data-testid="dialog-new-chat">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {isGroup && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Group Name (optional)</Label>
              <Input placeholder="e.g. Project Alpha Team" value={groupName} onChange={e => setGroupName(e.target.value)} data-testid="input-group-name" />
            </div>
          )}
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Select members</Label>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {otherMembers.map(member => (
                <label
                  key={member.id}
                  className={cn("flex items-center gap-3 p-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors", selectedMembers.includes(member.id) && "bg-muted")}
                  data-testid={`member-select-${member.id}`}
                >
                  <Checkbox checked={selectedMembers.includes(member.id)} onCheckedChange={() => toggleMember(member.id)} />
                  <Avatar className="w-8 h-8">
                    <AvatarImage src={member.profileImageUrl || undefined} />
                    <AvatarFallback className="text-xs">{getMemberInitials(member)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{getMemberName(member)}</p>
                    <p className="text-[11px] text-muted-foreground">{member.email}</p>
                  </div>
                </label>
              ))}
              {otherMembers.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No team members to chat with yet</p>
              )}
            </div>
          </div>
          <Button className="w-full" onClick={handleCreate} disabled={selectedMembers.length === 0} data-testid="button-create-chat">
            {selectedMembers.length === 1 ? "Start Direct Message" : selectedMembers.length > 1 ? `Create Group (${selectedMembers.length + 1} members)` : "Select Members"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TeamChat({ initialChannelId }: { initialChannelId?: number | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null>(initialChannelId ?? null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [hasManuallyDeselected, setHasManuallyDeselected] = useState(false);
  const [isMobile, setIsMobile] = useState(typeof window !== "undefined" && window.innerWidth < 1024);
  const cameFromPush = useRef(!!initialChannelId);

  const userId = user?.id || "";

  const { data: userCaps } = useQuery<{ isOwner: boolean; role: string | null; capabilities: Record<string, boolean>; ownerId: string }>({
    queryKey: ["/api/user/capabilities"],
    staleTime: 60000,
  });
  const companyOwnerId = userCaps?.ownerId || user?.id || "";

  const { data: channels = [], isLoading: channelsLoading } = useQuery<EnrichedChannel[]>({
    queryKey: ["/api/team/channels"],
  });

  useEffect(() => {
    if (initialChannelId) {
      queryClient.prefetchQuery({
        queryKey: ["/api/team/channels", initialChannelId, "messages"],
        queryFn: async () => {
          const res = await fetch(`/api/team/channels/${initialChannelId}/messages`, { credentials: "include" });
          if (!res.ok) throw new Error("Failed to fetch messages");
          return res.json();
        },
      });
    }
  }, [initialChannelId]);

  const { data: teamMembers = [] } = useQuery<TeamMember[]>({
    queryKey: ["/api/team/members"],
  });

  const selectedChannel = channels.find(ch => ch.id === selectedChannelId);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 1024);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    if (initialChannelId && initialChannelId !== selectedChannelId) {
      setSelectedChannelId(initialChannelId);
      setHasManuallyDeselected(false);
    }
  }, [initialChannelId]);

  useEffect(() => {
    if (!selectedChannelId && !hasManuallyDeselected && channels.length > 0 && !isMobile) {
      const general = channels.find(ch => ch.type === "general");
      if (general) setSelectedChannelId(general.id);
    }
  }, [channels, selectedChannelId, hasManuallyDeselected, isMobile]);

  const teamCall = useTeamCall({
    userId,
    companyOwnerId,
    enabled: !!userId && !!userCaps?.ownerId,
  });

  const createChannelMutation = useMutation({
    mutationFn: async (data: { memberIds: string[]; name?: string }) => {
      const type = data.memberIds.length === 1 ? "direct" : "group";
      const res = await apiRequest("POST", "/api/team/channels", {
        memberIds: data.memberIds,
        name: data.name,
        type,
      });
      return res.json();
    },
    onSuccess: (newChannel: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/team/channels"] });
      setSelectedChannelId(newChannel.id);
    },
    onError: (err: any) => {
      toast({ title: "Failed to create conversation", description: err.message, variant: "destructive" });
    },
  });

  const handleCreateChannel = (memberIds: string[], name?: string) => {
    createChannelMutation.mutate({ memberIds, name });
  };

  const handleCall = (calleeId: string) => {
    teamCall.startCall(calleeId, selectedChannelId || undefined);
  };

  const handleConferenceCall = (calleeIds: string[]) => {
    teamCall.startConferenceCall(calleeIds, selectedChannelId || undefined);
  };

  const showList = !isMobile || !selectedChannelId;
  const showThread = !isMobile || !!selectedChannelId;

  return (
    <div className="flex flex-1 min-h-0 h-full">
      {showList && (
        <div className={cn("flex flex-col border-r bg-card", isMobile ? "w-full" : "w-80 shrink-0")}>
          <ConversationList
            channels={channels}
            currentUserId={userId}
            selectedChannelId={selectedChannelId}
            onSelectChannel={(id) => { setSelectedChannelId(id); setHasManuallyDeselected(false); }}
            onNewChat={() => setShowNewChat(true)}
            isLoading={channelsLoading}
            canCreateChat={userCaps?.isOwner || userCaps?.capabilities?.sendMessages !== false}
          />
        </div>
      )}

      {showThread && selectedChannelId && (
        <div className="flex-1 flex flex-col min-w-0">
          <MessageThread
            channelId={selectedChannelId}
            channel={selectedChannel}
            currentUserId={userId}
            onBack={() => { setSelectedChannelId(null); setHasManuallyDeselected(true); }}
            onCall={handleCall}
            onConferenceCall={handleConferenceCall}
            canSend={userCaps?.isOwner || userCaps?.capabilities?.sendMessages !== false}
            canCall={userCaps?.isOwner || userCaps?.capabilities?.makeCalls !== false}
          />
        </div>
      )}

      {showThread && !selectedChannelId && !isMobile && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center px-6">
            <MessageSquare className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
            <h3 className="font-medium text-muted-foreground">Select a conversation</h3>
            <p className="text-sm text-muted-foreground/60 mt-1">Choose a conversation from the list or start a new one</p>
          </div>
        </div>
      )}

      <NewChatDialog
        open={showNewChat}
        onClose={() => setShowNewChat(false)}
        teamMembers={teamMembers}
        currentUserId={userId}
        onCreateChannel={handleCreateChannel}
      />

      <TeamCallUI
        callState={teamCall.callState}
        remotePeer={teamCall.remotePeer}
        callDuration={teamCall.callDuration}
        isMuted={teamCall.isMuted}
        isConference={teamCall.isConference}
        isHost={teamCall.isHost}
        participantCount={teamCall.participantCount}
        canEndConference={teamCall.isHost || userId === companyOwnerId}
        onAccept={teamCall.acceptCall}
        onReject={teamCall.rejectCall}
        onEnd={teamCall.endCall}
        onEndConference={teamCall.endConference}
        onToggleMute={teamCall.toggleMute}
      />
    </div>
  );
}
