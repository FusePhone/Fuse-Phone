import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClipboardList, Plus, Trash2, AlertTriangle, CheckCircle2, Eye, X, Send, Megaphone } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface TaskItem {
  text: string;
  completed: boolean;
}

interface CrewNote {
  id: number;
  companyOwnerId: string;
  projectId: number | null;
  createdById: string;
  title: string;
  message: string | null;
  priority: string;
  tasks: TaskItem[] | null;
  createdAt: string;
  readByUserIds: string[];
  isReadByMe: boolean;
}

interface CrewNotesProps {
  projectId?: number;
  isOwner: boolean;
  compact?: boolean;
}

function CreateNoteDialog({ open, onClose, projectId, projects }: {
  open: boolean;
  onClose: () => void;
  projectId?: number;
  projects?: { id: number; title: string }[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState("normal");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projectId ? String(projectId) : "general");
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [newTask, setNewTask] = useState("");

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/crew-notes", {
        projectId: selectedProjectId === "general" ? null : parseInt(selectedProjectId),
        title,
        message: message || null,
        priority,
        tasks: tasks.length > 0 ? tasks : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-notes"] });
      toast({ title: "Note sent to crew" });
      setTitle("");
      setMessage("");
      setPriority("normal");
      setTasks([]);
      setNewTask("");
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Failed to create note", description: err.message, variant: "destructive" });
    },
  });

  const addTask = () => {
    if (!newTask.trim()) return;
    setTasks(prev => [...prev, { text: newTask.trim(), completed: false }]);
    setNewTask("");
  };

  const removeTask = (index: number) => {
    setTasks(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-create-crew-note">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="w-5 h-5" />
            Send Note to Crew
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {!projectId && projects && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Project</label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger data-testid="select-note-project">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General (All Crew)</SelectItem>
                  {projects.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{p.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
            <Input
              placeholder="e.g. Color change on living room"
              value={title}
              onChange={e => setTitle(e.target.value)}
              data-testid="input-note-title"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Details (optional)</label>
            <Textarea
              placeholder="Additional details for the crew..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              className="resize-none"
              data-testid="input-note-message"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Priority</label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger data-testid="select-note-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Task Checklist (optional)</label>
            <div className="space-y-1.5">
              {tasks.map((task, i) => (
                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/50 rounded-lg">
                  <ClipboardList className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1">{task.text}</span>
                  <button onClick={() => removeTask(i)} className="text-muted-foreground hover:text-destructive" data-testid={`button-remove-task-${i}`}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  placeholder="Add a task..."
                  value={newTask}
                  onChange={e => setNewTask(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addTask(); } }}
                  className="text-sm"
                  data-testid="input-new-task"
                />
                <Button variant="outline" size="sm" onClick={addTask} disabled={!newTask.trim()} data-testid="button-add-task">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={() => createMutation.mutate()}
            disabled={!title.trim() || createMutation.isPending}
            data-testid="button-send-crew-note"
          >
            <Send className="w-4 h-4 mr-2" />
            {createMutation.isPending ? "Sending..." : "Send to Crew"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CrewNoteCard({ note, isOwner, onAcknowledge, onDelete, onToggleTask }: {
  note: CrewNote;
  isOwner: boolean;
  onAcknowledge?: (id: number) => void;
  onDelete?: (id: number) => void;
  onToggleTask?: (noteId: number, taskIndex: number, completed: boolean) => void;
}) {
  const tasks = (note.tasks || []) as TaskItem[];
  const completedTasks = tasks.filter(t => t.completed).length;

  return (
    <Card className={cn(
      "p-3.5 border-l-4 transition-all",
      note.priority === "urgent" ? "border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20" : "border-l-blue-500 bg-blue-50/30 dark:bg-blue-950/10",
      !note.isReadByMe && !isOwner && "ring-2 ring-primary/30"
    )} data-testid={`crew-note-${note.id}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {note.priority === "urgent" && <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />}
            <h4 className="text-sm font-semibold truncate">{note.title}</h4>
          </div>
          {note.message && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{note.message}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isOwner && (
            <Badge variant="outline" className="text-[10px] px-1.5">
              <Eye className="w-3 h-3 mr-0.5" />
              {note.readByUserIds.length}
            </Badge>
          )}
          {isOwner && onDelete && (
            <button onClick={() => onDelete(note.id)} className="text-muted-foreground hover:text-destructive p-1" data-testid={`button-delete-note-${note.id}`}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {tasks.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Tasks</span>
            <span className="text-[10px] text-muted-foreground">{completedTasks}/{tasks.length}</span>
          </div>
          {tasks.map((task, i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer" data-testid={`task-item-${note.id}-${i}`}>
              <Checkbox
                checked={task.completed}
                onCheckedChange={(checked) => onToggleTask?.(note.id, i, !!checked)}
                disabled={isOwner}
              />
              <span className={cn("text-sm", task.completed && "line-through text-muted-foreground")}>{task.text}</span>
            </label>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-2.5">
        <span className="text-[10px] text-muted-foreground">{format(new Date(note.createdAt), "M/d h:mm a")}</span>
        {!isOwner && !note.isReadByMe && onAcknowledge && (
          <Button variant="outline" size="sm" onClick={() => onAcknowledge(note.id)} className="h-7 text-xs px-3" data-testid={`button-acknowledge-note-${note.id}`}>
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Got it
          </Button>
        )}
        {!isOwner && note.isReadByMe && (
          <span className="text-[10px] text-green-600 flex items-center gap-0.5">
            <CheckCircle2 className="w-3 h-3" /> Acknowledged
          </span>
        )}
      </div>
    </Card>
  );
}

export function CrewNotesSection({ projectId, isOwner, compact }: CrewNotesProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);

  const { data: notes = [] } = useQuery<CrewNote[]>({
    queryKey: ["/api/crew-notes"],
  });

  const { data: projectsList = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ["/api/projects"],
    enabled: isOwner && !projectId,
    select: (data: any[]) => data.map((p: any) => ({ id: p.id, title: p.title })),
  });

  const filteredNotes = projectId
    ? notes.filter(n => n.projectId === projectId || n.projectId === null)
    : notes;

  const unreadNotes = filteredNotes.filter(n => !n.isReadByMe && !isOwner);

  const acknowledgeMutation = useMutation({
    mutationFn: async (noteId: number) => {
      await apiRequest("POST", `/api/crew-notes/${noteId}/acknowledge`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crew-notes/unread"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (noteId: number) => {
      await apiRequest("DELETE", `/api/crew-notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-notes"] });
      toast({ title: "Note deleted" });
    },
  });

  const toggleTaskMutation = useMutation({
    mutationFn: async ({ noteId, taskIndex, completed }: { noteId: number; taskIndex: number; completed: boolean }) => {
      const note = notes.find(n => n.id === noteId);
      if (!note?.tasks) return;
      const updatedTasks = [...(note.tasks as TaskItem[])];
      updatedTasks[taskIndex] = { ...updatedTasks[taskIndex], completed };
      await apiRequest("PATCH", `/api/crew-notes/${noteId}/tasks`, { tasks: updatedTasks });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crew-notes"] });
    },
  });

  if (compact && !isOwner && unreadNotes.length === 0) return null;

  const displayNotes = compact ? (isOwner ? filteredNotes.slice(0, 5) : unreadNotes) : filteredNotes;

  return (
    <div data-testid="crew-notes-section">
      {isOwner && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold">Crew Notes</h3>
            {filteredNotes.length > 0 && (
              <Badge variant="secondary" className="text-xs">{filteredNotes.length}</Badge>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} className="h-7 text-xs" data-testid="button-create-crew-note">
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Note
          </Button>
        </div>
      )}

      {!isOwner && unreadNotes.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <Megaphone className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Updates from your team</h3>
          <Badge className="text-xs">{unreadNotes.length} new</Badge>
        </div>
      )}

      {displayNotes.length > 0 ? (
        <div className="space-y-2.5">
          {displayNotes.map(note => (
            <CrewNoteCard
              key={note.id}
              note={note}
              isOwner={isOwner}
              onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              onToggleTask={(noteId, taskIndex, completed) =>
                toggleTaskMutation.mutate({ noteId, taskIndex, completed })
              }
            />
          ))}
        </div>
      ) : isOwner ? (
        <p className="text-xs text-muted-foreground text-center py-4">No crew notes yet. Send a note to keep your team informed.</p>
      ) : null}

      <CreateNoteDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        projectId={projectId}
        projects={projectsList}
      />
    </div>
  );
}
