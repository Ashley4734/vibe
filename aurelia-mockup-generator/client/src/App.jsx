import React, { useState } from 'react';

export default function App() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [collection, setCollection] = useState('');
  const [imageMode, setImageMode] = useState('');
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState([]);
  const [downloadUrl, setDownloadUrl] = useState(null);

  const connectProgress = (genId) => {
    const eventSource = new EventSource(`/progress/${genId}`);
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.preview) {
        setPreviews(prev => [...prev, data]);
      }
    };
  };

  const handleGenerate = async () => {
    if (!file || !title || !collection) return alert('Fill all fields');
    setLoading(true);
    setPreviews([]);
    setDownloadUrl(null);

    const formData = new FormData();
    formData.append('artwork', file);
    formData.append('title', title);
    formData.append('collection', collection);
    if (imageMode) formData.append('imageMode', imageMode);

    const res = await fetch('/generate', { method: 'POST', body: formData });
    const { zip, genId } = await res.json();

    connectProgress(genId);

    const blob = await (await fetch(zip)).blob();
    setDownloadUrl(window.URL.createObjectURL(blob));

    setLoading(false);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl mb-4">Aurelia Galleria Mockup Generator</h1>
      <input type="file" onChange={e => setFile(e.target.files[0])} /><br />
      <input type="text" placeholder="Artwork Title" value={title} onChange={e => setTitle(e.target.value)} /><br />
      <input type="text" placeholder="Collection Name" value={collection} onChange={e => setCollection(e.target.value)} /><br />
      <input type="text" placeholder="Image Mode" value={imageMode} onChange={e => setImageMode(e.target.value)} /><br />
      <button onClick={handleGenerate} disabled={loading}>
        {loading ? 'Generating...' : 'Generate Mockups'}
      </button>

      <div className="grid grid-cols-2 gap-4 mt-6">
        {previews.map((p, i) => (
          <div key={i}>
            <p className="text-sm">{p.type}</p>
            <img src={p.preview} alt={p.type} className="border" />
          </div>
        ))}
      </div>

      {downloadUrl && (
        <a href={downloadUrl} download={`${title}_mockups.zip`} className="block mt-4 bg-blue-500 text-white px-4 py-2">
          Download All
        </a>
      )}
    </div>
  );
}
