import {
  atomStore,
  filesAtom,
  selectedFilesAtom,
  type FilesAtomTauri,
} from '@/lib/atoms';
import { listen } from '@tauri-apps/api/event';
import { useAtomValue } from 'jotai';
import { useEffect, useMemo, useState, type FC } from 'react';
import { FileItem } from './file-item';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { open } from '@tauri-apps/api/dialog';
import { invoke } from '@tauri-apps/api';
import { Checkbox } from '../ui/checkbox';

export interface FilesPanelProps {
  profileId: string;
}

const FilesPanel: FC<FilesPanelProps> = ({ profileId }) => {
  const files = useAtomValue(filesAtom as FilesAtomTauri);
  const selectedFiles = useAtomValue(selectedFilesAtom);

  // 【新增】：创建一个状态，记录用户是否勾选了“重命名文件夹本身”
  const [renameFolder, setRenameFolder] = useState(false);

  const checked = useMemo(
    () => files.length > 0 && selectedFiles.length === files.length,
    [selectedFiles, files],
  );

  async function onAddFile() {
    const openFiles = await open({ multiple: true, directory: false });

    if (!Array.isArray(openFiles)) {
      return;
    }

    atomStore.set(filesAtom as FilesAtomTauri, (prevFiles) => [
      ...new Set([...prevFiles, ...openFiles]),
    ]);
  }

  // 【修改】：根据勾选框的状态，决定是添加文件夹本身，还是读取里面的文件
  async function onAddDir() {
    const openDir = await open({ directory: true });

    if (typeof openDir !== 'string') {
      return;
    }

    if (renameFolder) {
      // 勾选了：直接把文件夹本身加进去
      atomStore.set(filesAtom as FilesAtomTauri, (prevFiles) => [
        ...new Set([...prevFiles, openDir]),
      ]);
    } else {
      // 没勾选：保留原版逻辑，读取内部文件
      const files = await invoke<string[]>('read_dir', { path: openDir });
      atomStore.set(filesAtom as FilesAtomTauri, (prevFiles) => [
        ...new Set([...prevFiles, ...files]),
      ]);
    }
  }

  function onCheckedChange(checked: boolean) {
    atomStore.set(selectedFilesAtom as FilesAtomTauri, () => {
      if (checked) {
        return files.slice();
      }

      return [];
    });
  }

  function onRemove() {
    atomStore.set(filesAtom as FilesAtomTauri, (prevFiles) =>
      prevFiles.filter((file) => !selectedFiles.includes(file)),
    );
    atomStore.set(selectedFilesAtom, []);
  }

  // 【修改】：拖拽文件时，也受勾选框的控制
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    listen('tauri://file-drop', async (e) => {
      if (!Array.isArray(e.payload)) {
        return;
      }

      const dropFiles: string[] = [];

      if (renameFolder) {
        // 勾选了：拖进来的全部直接作为对象
        for (const item of e.payload as string[]) {
          dropFiles.push(item);
        }
      } else {
        // 没勾选：原版逻辑，遇到文件夹就剥开
        for (const item of e.payload as string[]) {
          const isFile = await invoke<boolean>('is_file', { path: item });

          if (isFile) {
            dropFiles.push(item);
            continue;
          }

          const files = await invoke<string[]>('read_dir', { path: item });
          dropFiles.push(...files);
        }
      }

      atomStore.set(filesAtom as FilesAtomTauri, (prevFiles) => [
        ...new Set([...prevFiles, ...dropFiles]),
      ]);
    }).then((unlistenFn) => {
      unlisten = unlistenFn;
    });

    return () => {
      unlisten?.();
    };
  }, [renameFolder]); // 依赖项里加上它，保证切换开关时拖拽逻辑立刻生效

  return (
    <div className="size-full">
      <div className="flex w-full justify-between gap-x-2 pb-4">
        <div className="flex items-center gap-x-2">
          <Button size="sm" onClick={onAddFile}>
            添加文件
          </Button>
          <Button size="sm" onClick={onAddDir}>
            添加文件夹
          </Button>
          {/* 【新增UI】：在按钮旁边加上一个开关 */}
          <label className="ml-4 flex items-center gap-x-2 cursor-pointer text-sm font-medium text-neutral-700">
            <Checkbox
              checked={renameFolder}
              onCheckedChange={(c) => setRenameFolder(c === true)}
            />
            重命名文件夹本身
          </label>
        </div>
        <div className="flex items-center">
          {selectedFiles.length > 0 && (
            <Button size="sm" onClick={onRemove}>
              移除
            </Button>
          )}
        </div>
      </div>
      <div className="grid h-8 w-full grid-cols-[2rem_3rem_48%_1fr] divide-x divide-neutral-300 rounded-t border border-b-0 bg-neutral-200 text-sm">
        <div className="flex size-full items-center justify-center">
          <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
        </div>
        <span className="flex size-full items-center justify-center px-2">
          序号
        </span>
        <span className="flex size-full items-center px-2">文件名</span>
        <span className="flex size-full items-center px-2">预览</span>
      </div>
      <ScrollArea className="h-[calc(100%-5rem)] w-full rounded-b border border-t-0">
        <div className="flex w-full flex-col divide-y">
          {files.map((file, i) => {
            return (
              <FileItem
                key={file}
                file={file}
                profileId={profileId}
                index={i}
              />
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
};

export default FilesPanel;
