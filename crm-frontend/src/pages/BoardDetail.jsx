import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Tldraw, getSnapshot, loadSnapshot } from 'tldraw';
import 'tldraw/tldraw.css';
import { api } from '../api/client';
import { getBoardSocket } from '../lib/socket';

const EMIT_THROTTLE_MS = 400;

export default function BoardDetail() {
  const { id } = useParams();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState(null);
  const editorRef = useRef(null);
  const throttleTimer = useRef(null);
  const pendingSnapshot = useRef(null);

  useEffect(() => {
    api.boards.get(id).then((d) => setBoard(d.board)).catch((err) => setError(err.message));
  }, [id]);

  useEffect(() => {
    const socket = getBoardSocket();
    socket.emit('board:join', id);

    function onSceneUpdate({ sceneData }) {
      const editor = editorRef.current;
      if (!editor || !sceneData) return;
      // Tagged 'remote' so the local store.listen({source:'user'}) filter
      // below never re-emits an update we just received.
      editor.store.mergeRemoteChanges(() => loadSnapshot(editor.store, sceneData));
    }

    socket.on('scene:update', onSceneUpdate);
    return () => {
      socket.off('scene:update', onSceneUpdate);
    };
  }, [id]);

  function handleMount(editor) {
    editorRef.current = editor;
    if (board?.sceneData) {
      editor.store.mergeRemoteChanges(() => loadSnapshot(editor.store, board.sceneData));
    }

    editor.store.listen(
      () => {
        pendingSnapshot.current = getSnapshot(editor.store);
        if (throttleTimer.current) return;
        throttleTimer.current = setTimeout(() => {
          throttleTimer.current = null;
          if (pendingSnapshot.current) {
            getBoardSocket().emit('scene:update', { boardId: id, sceneData: pendingSnapshot.current });
          }
        }, EMIT_THROTTLE_MS);
      },
      { source: 'user', scope: 'document' }
    );
  }

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div>
      <p><Link to="/boards">&larr; Boards</Link></p>
      <h1>{board?.title || 'Loading…'}</h1>
      <div style={{ height: '75vh', border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
        {board && <Tldraw onMount={handleMount} />}
      </div>
    </div>
  );
}
