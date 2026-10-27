import { useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { api } from "../../lib/api";
import { FILE_LIMITS, FILE_TYPES, fileExt, fileSize, STARTER_FOLDERS, type HubFolder, type HubState, type HubTeam } from "../../lib/teamHub";
import { useToast } from "../../lib/toast";

const day = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
const ACCEPT = FILE_TYPES.map((t) => `.${t}`).join(",");

/**
 * Folders of files for a team (waivers, medical forms, practice plans,
 * scouting reports) plus the whole Front Office's shared folders. Files are
 * stored privately and only download for the director and staff.
 */
export function FilesTab({ hub, team }: { hub: HubState; team: HubTeam }) {
  const toast = useToast();
  const [folders, setFolders] = useState<HubFolder[] | null>(null);
  const [used, setUsed] = useState(0);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState("");
  const [newName, setNewName] = useState("");
  const [forAll, setForAll] = useState(false);
  const [openId, setOpenId] = useState("");
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [sure, setSure] = useState("");
  const director = hub.role === "director";

  const take = (r: { folders: HubFolder[]; used: number }) => {
    setFolders(r.folders);
    setUsed(r.used);
  };

  useEffect(() => {
    api
      .folders(hub.org.id)
      .then(take)
      .catch((e: Error) => setFailed(e.message));
  }, [hub.org.id]);

  const run = async (label: string, work: () => Promise<void>) => {
    setBusy(label);
    try {
      await work();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const upload = (folder: HubFolder, files: FileList | File[]) =>
    run(`Uploading to ${folder.name}…`, async () => {
      let n = 0;
      for (const f of Array.from(files)) {
        if (!FILE_TYPES.includes(fileExt(f.name))) {
          toast(`${f.name} isn't a document or picture we keep. Save it as a PDF and try again.`);
          continue;
        }
        if (f.size > FILE_LIMITS.size) {
          toast(`${f.name} is ${fileSize(f.size)}. Files can be up to ${fileSize(FILE_LIMITS.size)}.`);
          continue;
        }
        take(await api.uploadFile(folder.id, f));
        n++;
      }
      if (n) toast(`${n} ${n === 1 ? "file" : "files"} added to ${folder.name}.`);
      setOpenId(folder.id);
    });

  if (failed && !folders)
    return (
      <p className="hint" role="alert">
        {failed}
      </p>
    );
  if (!folders) return <p role="status">Opening files…</p>;

  const shown = folders.filter((f) => f.teamId === team.id || f.teamId === null);
  const teamFolders = shown.filter((f) => f.teamId === team.id);
  const orgFolders = shown.filter((f) => f.teamId === null);
  const canWrite = (f: HubFolder) => f.teamId !== null || director;
  const pct = Math.min(100, Math.round((used / FILE_LIMITS.total) * 100));

  const folderCard = (f: HubFolder) => {
    const open = openId === f.id;
    return (
      <li key={f.id} className={`hub-folder${open ? " is-open" : ""}`}>
        <DropZone disabled={!canWrite(f) || Boolean(busy)} onFiles={(files) => void upload(f, files)}>
          <div className="hub-folder-head">
            <button type="button" className="hub-folder-name" aria-expanded={open} onClick={() => setOpenId(open ? "" : f.id)}>
              <Icon name="folder" size={18} />
              <b>{f.name}</b>
              <small>
                {f.files.length} {f.files.length === 1 ? "file" : "files"}
              </small>
              <Icon name="chevron" size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} />
            </button>
            {canWrite(f) && (
              <div className="fo-actions">
                <UploadButton folder={f} disabled={Boolean(busy)} onFiles={(files) => void upload(f, files)} />
                <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRenaming({ id: f.id, name: f.name })} aria-label={`Rename ${f.name}`}>
                  <Icon name="pencil" size={13} />
                </button>
                {sure === f.id ? (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => void run("Removing…", async () => take(await api.deleteFolder(f.id)))}
                  >
                    Delete folder and {f.files.length} {f.files.length === 1 ? "file" : "files"}
                  </button>
                ) : (
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setSure(f.id)} aria-label={`Delete ${f.name}`}>
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </div>
            )}
          </div>
          {renaming?.id === f.id && (
            <form
              className="hub-inline"
              onSubmit={(e) => {
                e.preventDefault();
                const name = renaming.name.trim();
                setRenaming(null);
                if (name && name !== f.name) void run("Renaming…", async () => take(await api.renameFolder(f.id, name)));
              }}
            >
              <input className="input" value={renaming.name} maxLength={60} autoFocus onChange={(e) => setRenaming({ id: f.id, name: e.target.value })} aria-label="Folder name" />
              <button type="submit" className="btn btn-primary btn-sm">
                Rename
              </button>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setRenaming(null)}>
                Cancel
              </button>
            </form>
          )}
          {open &&
            (f.files.length ? (
              <ul className="hub-files">
                {f.files.map((x) => (
                  <li key={x.id}>
                    <span className="hub-ext">{fileExt(x.name) || "file"}</span>
                    <a href={`/api/hub-files/${x.id}`} download={x.name}>
                      {x.name}
                    </a>
                    <small>
                      {fileSize(x.size)} · {x.uploaderName} · {day(x.createdAt)}
                    </small>
                    {(canWrite(f) || x.mine) && (
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={() => void run("Removing…", async () => take(await api.deleteFile(x.id)))}
                        aria-label={`Delete ${x.name}`}
                      >
                        <Icon name="trash" size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">{canWrite(f) ? "Empty. Drop files here or press Upload." : "Nothing in this folder yet."}</p>
            ))}
        </DropZone>
      </li>
    );
  };

  return (
    <section className="hub-panel" aria-labelledby="hub-files">
      <div className="hub-head">
        <h3 id="hub-files">{team.name} files</h3>
        <div className="hub-usage" title={`${fileSize(used)} of ${fileSize(FILE_LIMITS.total)} used`}>
          <small>
            {fileSize(used)} of {fileSize(FILE_LIMITS.total)}
          </small>
          <span>
            <i style={{ width: `${pct}%` }} />
          </span>
        </div>
      </div>
      {busy && (
        <p className="hint" role="status">
          {busy}
        </p>
      )}

      {teamFolders.length === 0 && (
        <div className="hub-presets">
          <p>Start {team.name}'s folders. Drop waivers, physicals, practice plans and scouting reports in them; only you and the staff can open them.</p>
          <button type="button" className="btn btn-quiet btn-sm" disabled={Boolean(busy)} onClick={() => void run("Adding folders…", async () => take(await api.addFolders(hub.org.id, team.id, STARTER_FOLDERS)))}>
            <Icon name="folder" size={14} /> Add {STARTER_FOLDERS.join(", ")}
          </button>
        </div>
      )}
      {teamFolders.length > 0 && <ul className="hub-folders">{teamFolders.map(folderCard)}</ul>}

      {orgFolders.length > 0 && (
        <>
          <h4 className="hub-sub">Shared with all of {hub.org.name}</h4>
          <ul className="hub-folders">{orgFolders.map(folderCard)}</ul>
        </>
      )}

      <form
        className="hub-inline hub-noprint"
        onSubmit={(e) => {
          e.preventDefault();
          const name = newName.trim();
          if (!name) return;
          void run("Adding the folder…", async () => {
            take(await api.addFolders(hub.org.id, forAll ? null : team.id, [name]));
            setNewName("");
          });
        }}
      >
        <input className="input" value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder="New folder name" aria-label="New folder name" />
        {director && (
          <label className="check">
            <input type="checkbox" checked={forAll} onChange={(e) => setForAll(e.target.checked)} /> For the whole Front Office
          </label>
        )}
        <button type="submit" className="btn btn-quiet btn-sm" disabled={!newName.trim() || Boolean(busy)}>
          <Icon name="plus" size={14} /> Add folder
        </button>
      </form>
      <p className="hint">
        <Icon name="lock" size={12} /> Files are stored privately and download only for {director ? "you and each team's staff" : "your director and this team's staff"}. PDFs, Word, Excel,
        PowerPoint and pictures up to {fileSize(FILE_LIMITS.size)} each.
      </p>
    </section>
  );
}

function UploadButton({ folder, disabled, onFiles }: { folder: HubFolder; disabled: boolean; onFiles: (files: FileList) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className="btn btn-quiet btn-sm" disabled={disabled} onClick={() => input.current?.click()} aria-label={`Upload to ${folder.name}`}>
        <Icon name="upload" size={13} /> Upload
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** Drag files from the desktop onto a folder. */
function DropZone({ disabled, onFiles, children }: { disabled: boolean; onFiles: (files: FileList) => void; children: React.ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`hub-drop${over ? " is-over" : ""}`}
      onDragOver={(e) => {
        if (disabled || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (disabled || !e.dataTransfer.files.length) return;
        e.preventDefault();
        onFiles(e.dataTransfer.files);
      }}
    >
      {children}
    </div>
  );
}
