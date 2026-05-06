import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ClipboardList, Edit2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Outcome = {
  id: number;
  name: string;
  description: string | null;
  unit: string | null;
  positiveLabel: string;
  negativeLabel: string;
  isDefault: boolean;
  sortOrder: number;
};

type OutcomeForm = {
  name: string;
  description: string;
  unit: string;
  positiveLabel: string;
  negativeLabel: string;
  sortOrder: number;
};

const defaultForm: OutcomeForm = {
  name: "",
  description: "",
  unit: "",
  positiveLabel: "陽性",
  negativeLabel: "陰性",
  sortOrder: 0,
};

export default function OutcomesPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<Outcome | null>(null);
  const [form, setForm] = useState<OutcomeForm>(defaultForm);

  const utils = trpc.useUtils();
  const { data: outcomes, isLoading } = trpc.outcomes.list.useQuery();

  const createMutation = trpc.outcomes.create.useMutation({
    onSuccess: () => {
      utils.outcomes.list.invalidate();
      toast.success("アウトカムを登録しました");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(`エラー: ${e.message}`),
  });

  const updateMutation = trpc.outcomes.update.useMutation({
    onSuccess: () => {
      utils.outcomes.list.invalidate();
      toast.success("アウトカムを更新しました");
      setDialogOpen(false);
    },
    onError: (e) => toast.error(`エラー: ${e.message}`),
  });

  const deleteMutation = trpc.outcomes.delete.useMutation({
    onSuccess: () => {
      utils.outcomes.list.invalidate();
      toast.success("アウトカムを削除しました");
      setDeleteId(null);
    },
    onError: (e) => toast.error(`エラー: ${e.message}`),
  });

  const openCreate = () => {
    setEditTarget(null);
    setForm(defaultForm);
    setDialogOpen(true);
  };

  const openEdit = (o: Outcome) => {
    setEditTarget(o);
    setForm({
      name: o.name,
      description: o.description ?? "",
      unit: o.unit ?? "",
      positiveLabel: o.positiveLabel,
      negativeLabel: o.negativeLabel,
      sortOrder: o.sortOrder,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.warning("アウトカム名を入力してください");
      return;
    }
    const data = {
      name: form.name,
      description: form.description || undefined,
      unit: form.unit || undefined,
      positiveLabel: form.positiveLabel || "陽性",
      negativeLabel: form.negativeLabel || "陰性",
      sortOrder: Number(form.sortOrder) || 0,
      isDefault: false,
    };
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ページヘッダー */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold">アウトカム管理</h1>
            <p className="text-sm text-muted-foreground">予測対象のアウトカムを登録・管理します</p>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          新規登録
        </Button>
      </div>

      {/* アウトカム一覧 */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : outcomes?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>アウトカムが登録されていません</p>
            <Button variant="outline" className="mt-4" onClick={openCreate}>
              最初のアウトカムを登録する
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {outcomes?.map((o) => (
            <Card key={o.id} className="transition-all hover:shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{o.name}</h3>
                      {o.unit && (
                        <Badge variant="secondary" className="text-xs">{o.unit}</Badge>
                      )}
                      {o.isDefault && (
                        <Badge className="text-xs bg-primary/10 text-primary border-primary/30">デフォルト</Badge>
                      )}
                    </div>
                    {o.description && (
                      <p className="text-sm text-muted-foreground mt-1">{o.description}</p>
                    )}
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>陽性ラベル: <strong className="text-emerald-700">{o.positiveLabel}</strong></span>
                      <span>陰性ラベル: <strong className="text-red-600">{o.negativeLabel}</strong></span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(o)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteId(o.id)}
                      disabled={o.isDefault}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 登録・編集ダイアログ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? "アウトカムを編集" : "アウトカムを新規登録"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>アウトカム名 <span className="text-destructive">*</span></Label>
              <Input
                placeholder="例: 歩行自立、FIM合計、入院日数"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>説明</Label>
              <Input
                placeholder="例: 退院時のFAC（機能的歩行分類）≥4を歩行自立と定義"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>単位</Label>
              <Input
                placeholder="例: FAC、点、日"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>陽性ラベル</Label>
                <Input
                  placeholder="例: 歩行自立"
                  value={form.positiveLabel}
                  onChange={(e) => setForm((f) => ({ ...f, positiveLabel: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>陰性ラベル</Label>
                <Input
                  placeholder="例: 歩行非自立"
                  value={form.negativeLabel}
                  onChange={(e) => setForm((f) => ({ ...f, negativeLabel: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>表示順</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editTarget ? "更新" : "登録"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 削除確認ダイアログ */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => { if (!o) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>アウトカムを削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              この操作は取り消せません。関連する文献ルールや予測履歴も参照できなくなる可能性があります。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
