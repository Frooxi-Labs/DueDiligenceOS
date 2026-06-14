'use client';

// Adapted from magicui's file-tree (https://magicui.design) for DueDiligenceOS:
// an animated, accessible tree built on Radix Accordion + framer-motion.
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, FileIcon, FolderIcon, FolderOpenIcon } from 'lucide-react';
import React, { createContext, forwardRef, useCallback, useContext, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface TreeViewElement {
  id: string;
  name: string;
  isSelectable?: boolean;
  children?: TreeViewElement[];
}

interface TreeContextProps {
  selectedId: string | undefined;
  expandedItems: string[] | undefined;
  indicator: boolean;
  handleExpand: (id: string) => void;
  selectItem: (id: string) => void;
  direction: 'rtl' | 'ltr';
}

const TreeContext = createContext<TreeContextProps | null>(null);

const useTree = () => {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error('useTree must be used within a TreeProvider');
  return ctx;
};

type TreeProps = React.HTMLAttributes<HTMLDivElement> & {
  initialSelectedId?: string;
  indicator?: boolean;
  elements?: TreeViewElement[];
  initialExpandedItems?: string[];
};

const Tree = forwardRef<HTMLDivElement, TreeProps>(
  ({ className, elements, initialSelectedId, initialExpandedItems, indicator = true, children, ...props }, ref) => {
    const [selectedId, setSelectedId] = useState<string | undefined>(initialSelectedId);
    const [expandedItems, setExpandedItems] = useState<string[] | undefined>(initialExpandedItems);

    const selectItem = useCallback((id: string) => setSelectedId(id), []);
    const handleExpand = useCallback((id: string) => {
      setExpandedItems((prev) => (prev?.includes(id) ? prev.filter((i) => i !== id) : [...(prev ?? []), id]));
    }, []);

    // Keep external expansion in sync (e.g. when the active deal changes).
    useEffect(() => {
      if (initialExpandedItems) setExpandedItems((prev) => Array.from(new Set([...(prev ?? []), ...initialExpandedItems])));
    }, [initialExpandedItems?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
      <TreeContext.Provider value={{ selectedId, expandedItems, handleExpand, selectItem, indicator, direction: 'ltr' }}>
        <div className={cn('size-full', className)} ref={ref} {...props}>
          <AccordionPrimitive.Root type="multiple" value={expandedItems} onValueChange={(v) => setExpandedItems(v)}>
            {children}
          </AccordionPrimitive.Root>
        </div>
      </TreeContext.Provider>
    );
  }
);
Tree.displayName = 'Tree';

type FolderProps = {
  element: string;
  value: string;
  isSelectable?: boolean;
  icon?: React.ReactNode;
  onSelect?: () => void;
} & React.HTMLAttributes<HTMLDivElement>;

const Folder = forwardRef<HTMLButtonElement, FolderProps>(
  ({ className, element, value, isSelectable = true, icon, onSelect, children, ...props }, ref) => {
    const { selectedId, indicator, handleExpand, expandedItems, selectItem } = useTree();
    const open = expandedItems?.includes(value);
    return (
      <AccordionPrimitive.Item value={value} className="relative h-full overflow-hidden" {...props}>
        <AccordionPrimitive.Trigger
          ref={ref}
          className={cn('flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] w-full text-left', className, {
            'bg-neutral-800 text-neutral-100': selectedId === value,
            'text-neutral-300 hover:bg-neutral-800/50': selectedId !== value,
          })}
          disabled={!isSelectable}
          onClick={() => {
            handleExpand(value);
            selectItem(value);
            onSelect?.();
          }}
        >
          <ChevronRight className={cn('size-3.5 shrink-0 text-neutral-500 transition-transform duration-200', open && 'rotate-90')} />
          {icon ?? (open ? <FolderOpenIcon className="size-4 shrink-0 text-blue-400" /> : <FolderIcon className="size-4 shrink-0 text-blue-400" />)}
          <span className="truncate">{element}</span>
        </AccordionPrimitive.Trigger>
        <AccordionPrimitive.Content className="relative overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <AnimatePresence>
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={cn('ml-3 flex flex-col gap-0.5 py-0.5', indicator && 'border-l border-neutral-800 pl-1')}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </AccordionPrimitive.Content>
      </AccordionPrimitive.Item>
    );
  }
);
Folder.displayName = 'Folder';

type FileProps = {
  value: string;
  isSelectable?: boolean;
  fileIcon?: React.ReactNode;
  onSelect?: () => void;
} & React.HTMLAttributes<HTMLButtonElement>;

const File = forwardRef<HTMLButtonElement, FileProps>(
  ({ value, className, isSelectable = true, fileIcon, onSelect, children, ...props }, ref) => {
    const { selectedId, selectItem } = useTree();
    const selected = selectedId === value;
    return (
      <button
        ref={ref}
        type="button"
        disabled={!isSelectable}
        className={cn('flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] w-full text-left', selected ? 'bg-neutral-800 text-neutral-100' : 'text-neutral-400 hover:bg-neutral-800/50', className)}
        onClick={() => {
          selectItem(value);
          onSelect?.();
        }}
        {...props}
      >
        {fileIcon ?? <FileIcon className="size-3.5 shrink-0 text-neutral-500" />}
        {children}
      </button>
    );
  }
);
File.displayName = 'File';

export { Tree, Folder, File };
