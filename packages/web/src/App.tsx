import React, { useState, useEffect } from 'react';
import { Users, TrendingUp, Calendar, DollarSign, Volume2, Info, MapPin, ChevronRight, RefreshCw } from 'lucide-react';

// Hindi translations
const translations = {
  hi: {
    appTitle: 'MGNREGA जानकारी',
    selectDistrict: 'अपना जिला चुनें',
    detectLocation: 'मेरा स्थान खोजें',
    currentMonth: 'इस महीने',
    lastUpdated: 'अपडेट किया गया',
    households: 'परिवार',
    personDays: 'व्यक्ति-दिवस',
    avgDays: 'औसत दिन',
    payments: 'भुगतान समय पर',
    vsLastMonth: 'पिछले महीने से',
    vsStateAvg: 'राज्य औसत से',
    moreDetails: 'अधिक जानकारी',
    listening: 'सुन रहे हैं...',
    offline: 'ऑफलाइन मोड',
    loading: 'लोड हो रहा है...',
    error: 'कुछ गलत हो गया',
    retry: 'फिर कोशिश करें',
    good: 'अच्छा',
    average: 'ठीक',
    needsAttention: 'ध्यान दें',
    improving: 'बढ़ रहा है',
    declining: 'घट रहा है',
    stable: 'स्थिर'
  }
};

// API base URL - using fallback for non-Vite environments
const API_BASE = (typeof process !== 'undefined' && process.env?.REACT_APP_API_BASE_URL) || 
                 'http://localhost:3000/api/v1';

// Status color mapping
const statusColors = {
  good: 'bg-green-100 text-green-800 border-green-300',
  average: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  needsAttention: 'bg-red-100 text-red-800 border-red-300',
  improving: 'text-green-600',
  declining: 'text-red-600',
  stable: 'text-gray-600'
};

function App() {
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [districts, setDistricts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [playingAudio, setPlayingAudio] = useState(null);
  const t = translations.hi;

  // Detect online/offline
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Load districts on mount
  useEffect(() => {
    loadDistricts();
  }, []);

  // Load cached data if offline
  useEffect(() => {
    if (isOffline && selectedDistrict) {
      loadCachedSummary(selectedDistrict.district_id);
    }
  }, [isOffline, selectedDistrict]);

  async function loadDistricts() {
    try {
      const response = await fetch(`${API_BASE}/districts?state=Uttar%20Pradesh`);
      const data = await response.json();
      setDistricts(data.districts);
    } catch (err) {
      console.error('Failed to load districts:', err);
    }
  }

  async function detectLocation() {
    if (!navigator.geolocation) {
      alert('आपका ब्राउज़र लोकेशन सपोर्ट नहीं करता');
      return;
    }

    setLoading(true);
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          
          const response = await fetch(`${API_BASE}/districts/reverse-geocode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: latitude, lon: longitude })
          });
          
          const data = await response.json();
          
          if (data.success) {
            const district = districts.find(d => d.district_id === data.district.district_id);
            if (district) {
              setSelectedDistrict(district);
              loadSummary(district.district_id);
            }
          }
        } catch (err) {
          console.error('Geocoding failed:', err);
          setError('स्थान खोजने में त्रुटि');
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.error('Geolocation error:', err);
        setError('स्थान की अनुमति नहीं मिली');
        setLoading(false);
      }
    );
  }

  async function loadSummary(districtId) {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}/summary?district_id=${districtId}`);
      const data = await response.json();
      
      if (data.success) {
        setSummary(data);
        // Cache for offline use
        if ('indexedDB' in window) {
          const db = await openDB();
          await db.put('summaries', data, districtId);
        }
      }
    } catch (err) {
      console.error('Failed to load summary:', err);
      setError('डेटा लोड करने में त्रुटि');
      // Try to load from cache
      await loadCachedSummary(districtId);
    } finally {
      setLoading(false);
    }
  }

  async function loadCachedSummary(districtId) {
    if ('indexedDB' in window) {
      try {
        const db = await openDB();
        const cached = await db.get('summaries', districtId);
        if (cached) {
          setSummary(cached);
        }
      } catch (err) {
        console.error('Failed to load cache:', err);
      }
    }
  }

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('mgnrega_cache', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('summaries')) {
          db.createObjectStore('summaries');
        }
      };
    });
  }

  function playAudio(audioUrl, key) {
    if (playingAudio === key) {
      setPlayingAudio(null);
      return;
    }

    setPlayingAudio(key);
    const audio = new Audio(audioUrl);
    audio.play();
    audio.onended = () => setPlayingAudio(null);
  }

  function formatNumber(num) {
    if (num >= 100000) return `${(num / 100000).toFixed(1)} लाख`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)} हज़ार`;
    return num.toString();
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-600 to-green-600 text-white shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-3xl font-bold text-center mb-2">{t.appTitle}</h1>
          {isOffline && (
            <div className="bg-yellow-500 text-yellow-900 px-3 py-2 rounded text-center text-sm font-medium">
              📵 {t.offline}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* District Selection */}
        {!selectedDistrict && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 text-center">
              {t.selectDistrict}
            </h2>
            
            <button
              onClick={detectLocation}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-6 rounded-xl mb-4 flex items-center justify-center gap-3 text-lg disabled:opacity-50"
            >
              <MapPin size={24} />
              {t.detectLocation}
            </button>

            <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
              {districts.map(district => (
                <button
                  key={district.district_id}
                  onClick={() => {
                    setSelectedDistrict(district);
                    loadSummary(district.district_id);
                  }}
                  className="bg-gray-50 hover:bg-gray-100 border-2 border-gray-200 rounded-lg p-4 text-left transition-colors"
                >
                  <div className="font-bold text-lg text-gray-800">
                    {district.district_name_hi}
                  </div>
                  <div className="text-sm text-gray-600">
                    {district.district_name}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <RefreshCw className="animate-spin mx-auto mb-4 text-blue-600" size={48} />
            <p className="text-xl text-gray-600">{t.loading}</p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6 text-center">
            <p className="text-xl text-red-800 mb-4">{error}</p>
            <button
              onClick={() => selectedDistrict && loadSummary(selectedDistrict.district_id)}
              className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-lg"
            >
              {t.retry}
            </button>
          </div>
        )}

        {/* Summary View */}
        {summary && selectedDistrict && !loading && (
          <div className="space-y-6">
            {/* District Header */}
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-2xl font-bold text-gray-800">
                  {summary.district.district_name_hi}
                </h2>
                <button
                  onClick={() => setSelectedDistrict(null)}
                  className="text-blue-600 hover:text-blue-800 font-medium"
                >
                  बदलें
                </button>
              </div>
              <div className="text-sm text-gray-600">
                {t.currentMonth}: {summary.current_month.month}/{summary.current_month.year}
              </div>
              {summary.last_updated && (
                <div className="text-xs text-gray-500 mt-1">
                  {t.lastUpdated}: {new Date(summary.last_updated).toLocaleDateString('hi-IN')}
                </div>
              )}
            </div>

            {/* Overall Status Card */}
            <div className={`rounded-xl shadow-lg p-6 border-4 ${statusColors[summary.status.overall]}`}>
              <div className="text-center">
                <div className="text-4xl font-bold mb-2">
                  {summary.status.overall === 'good' && '😊 ' + t.good}
                  {summary.status.overall === 'average' && '😐 ' + t.average}
                  {summary.status.overall === 'needsAttention' && '😟 ' + t.needsAttention}
                </div>
                <div className="text-lg">जिले का प्रदर्शन</div>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-4">
              {/* Households */}
              <MetricCard
                icon={<Users size={40} />}
                label={t.households}
                value={formatNumber(summary.current_month.metrics.households_work)}
                change={summary.comparison.vs_previous_month?.households_change_pct}
                status={summary.status.person_days}
                audioUrl={summary.audio_urls?.households}
                audioKey="households"
                playingAudio={playingAudio}
                onPlay={playAudio}
                t={t}
              />

              {/* Person Days */}
              <MetricCard
                icon={<Calendar size={40} />}
                label={t.personDays}
                value={formatNumber(summary.current_month.metrics.person_days)}
                change={summary.comparison.vs_previous_month?.person_days_change_pct}
                status={summary.status.person_days}
                audioUrl={summary.audio_urls?.person_days}
                audioKey="person_days"
                playingAudio={playingAudio}
                onPlay={playAudio}
                t={t}
              />

              {/* Avg Days */}
              <MetricCard
                icon={<TrendingUp size={40} />}
                label={t.avgDays}
                value={summary.current_month.metrics.avg_days_per_household?.toFixed(1) || '—'}
                change={null}
                status="stable"
                audioUrl={null}
                audioKey="avg_days"
                playingAudio={playingAudio}
                onPlay={playAudio}
                t={t}
              />

              {/* Payments */}
              <MetricCard
                icon={<DollarSign size={40} />}
                label={t.payments}
                value={`${summary.current_month.metrics.payments_on_time_pct?.toFixed(1)}%`}
                change={summary.comparison.vs_state_avg?.payment_pct_diff}
                status={summary.status.payments}
                audioUrl={summary.audio_urls?.payments}
                audioKey="payments"
                playingAudio={playingAudio}
                onPlay={playAudio}
                t={t}
              />
            </div>

            {/* Comparison Card */}
            {summary.comparison && (
              <div className="bg-white rounded-xl shadow-lg p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4">तुलना</h3>
                
                <div className="space-y-3">
                  {summary.comparison.vs_previous_month && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-700">{t.vsLastMonth}</span>
                      <span className={`font-bold text-lg ${
                        parseFloat(summary.comparison.vs_previous_month.person_days_change_pct) > 0 
                          ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {parseFloat(summary.comparison.vs_previous_month.person_days_change_pct) > 0 ? '+' : ''}
                        {summary.comparison.vs_previous_month.person_days_change_pct}%
                      </span>
                    </div>
                  )}

                  {summary.comparison.vs_state_avg && (
                    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <span className="text-gray-700">{t.vsStateAvg}</span>
                      <span className={`font-bold text-lg ${
                        parseFloat(summary.comparison.vs_state_avg.person_days_diff_pct) > 0 
                          ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {parseFloat(summary.comparison.vs_state_avg.person_days_diff_pct) > 0 ? '+' : ''}
                        {summary.comparison.vs_state_avg.person_days_diff_pct}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-6 mt-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <p className="text-sm">MGNREGA डेटा • data.gov.in से</p>
          <p className="text-xs text-gray-400 mt-2">
            यह जानकारी केवल सूचना के लिए है
          </p>
        </div>
      </footer>
    </div>
  );
}

function MetricCard({ icon, label, value, change, status, audioUrl, audioKey, playingAudio, onPlay, t }) {
  return (
    <div className="bg-white rounded-xl shadow-lg p-4 hover:shadow-xl transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="text-blue-600">{icon}</div>
        {audioUrl && (
          <button
            onClick={() => onPlay(audioUrl, audioKey)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Play audio"
          >
            <Volume2 
              size={24} 
              className={playingAudio === audioKey ? 'text-green-600 animate-pulse' : 'text-gray-600'}
            />
          </button>
        )}
      </div>
      
      <div className="text-sm text-gray-600 mb-1">{label}</div>
      <div className="text-2xl font-bold text-gray-800 mb-2">{value}</div>
      
      {change && (
        <div className={`flex items-center gap-1 text-sm font-medium ${
          parseFloat(change) > 0 ? 'text-green-600' : 'text-red-600'
        }`}>
          <span>{parseFloat(change) > 0 ? '↑' : '↓'}</span>
          <span>{Math.abs(parseFloat(change)).toFixed(1)}%</span>
        </div>
      )}
      
      {status && status !== 'stable' && (
        <div className={`text-xs mt-1 ${statusColors[status]}`}>
          {t[status]}
        </div>
      )}
    </div>
  );
}

export default App;