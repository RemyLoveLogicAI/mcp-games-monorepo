'use client';

import { useState } from 'react';
import { story } from './story';

export default function GameClient() {
  const [sceneId, setSceneId] = useState('start');
  const [history, setHistory] = useState<string[]>([]);

  const scene = story.scenes.find((s) => s.id === sceneId)!;

  function handleChoice(nextSceneId: string, choiceText: string) {
    setSceneId(nextSceneId);
    setHistory((prev) => [...prev, choiceText]);
  }

  function restart() {
    setSceneId('start');
    setHistory([]);
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="mb-6 text-center">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            MCP Games
          </h1>
          <p className="text-slate-400 text-sm mt-1">{story.title}</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 shadow-2xl backdrop-blur">
          {history.length > 0 && (
            <div className="text-xs text-slate-500 mb-4 truncate">
              {history.join(' > ')}
            </div>
          )}

          <p className="text-lg text-slate-100 leading-relaxed whitespace-pre-line mb-8">
            {scene.narrative}
          </p>

          {scene.choices.length > 0 ? (
            <div className="space-y-3">
              {scene.choices.map((choice) => (
                <button
                  key={choice.id}
                  onClick={() => handleChoice(choice.nextSceneId, choice.text)}
                  className="w-full text-left px-5 py-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                >
                  {choice.text}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              {scene.endingLink && (
                <a
                  href={scene.endingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 font-semibold text-white hover:opacity-90 transition"
                >
                  {scene.endingText || 'Learn more'}
                </a>
              )}
              <button
                onClick={restart}
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-slate-800 border border-slate-700 font-semibold hover:bg-slate-700 transition"
              >
                Play again
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <a href="/" className="text-slate-500 hover:text-slate-300 text-sm">
            Back to LoveLogic
          </a>
        </div>
      </div>
    </main>
  );
}
