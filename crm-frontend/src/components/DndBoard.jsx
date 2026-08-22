import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

function Card({ id, disabled, children }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, disabled });
  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
    cursor: disabled ? 'default' : 'grab',
  };
  return (
    <div ref={setNodeRef} style={style} {...(disabled ? {} : listeners)} {...(disabled ? {} : attributes)}>
      {children}
    </div>
  );
}

function Column({ id, className, children }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={className} style={isOver ? { outline: '2px solid var(--color-primary)' } : undefined}>
      {children}
    </div>
  );
}

// Generic drag-and-drop board: move a card between columns by dropping it,
// same effect as the status/stage <select> each card also still has (drag
// is a shortcut, not the only way - keeps the board usable without a mouse).
export function DndBoard({ columns, items, getItemId, getItemColumn, onMove, renderColumnHeader, renderCard, canDrag = () => true }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleDragEnd(event) {
    const { active, over } = event;
    if (!over) return;
    const item = items.find((i) => String(getItemId(i)) === String(active.id));
    if (!item) return;
    const targetColumn = over.id;
    if (getItemColumn(item) !== targetColumn) onMove(getItemId(item), targetColumn);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="board">
        {columns.map((col) => {
          const colItems = items.filter((i) => getItemColumn(i) === col.key);
          return (
            <Column key={col.key} id={col.key} className="board-column">
              {renderColumnHeader(col, colItems)}
              {colItems.map((item) => (
                <Card key={getItemId(item)} id={getItemId(item)} disabled={!canDrag(item)}>
                  {renderCard(item)}
                </Card>
              ))}
            </Column>
          );
        })}
      </div>
    </DndContext>
  );
}
