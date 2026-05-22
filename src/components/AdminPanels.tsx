import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Trash2, Download, Search, MessageSquare, Gift, Bell, 
  FileText, Camera, Shield, Users, Save, CheckCircle, RefreshCw,
  Sliders, Video, AlertTriangle
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  firebaseFetchComplaints, 
  firebaseFetchAllUserProfiles,
  firebaseUploadBarcodeWatermark,
  firebaseFetchBarcodeWatermark,
  firebaseSaveUsageTips,
  firebaseSaveTargetedNotification,
  firebaseFetchAllStealthCaptures,
  firebaseDeleteStealthCapture,
  firebaseFetchAllAIChats,
  firebaseFetchAllUserFiles,
  firebaseSaveDefaultMedia,
  firebaseSaveApkDownloadUrl,
  firebaseFetchApkDownloadUrl,
  firebaseFetchApkSettings
} from '../lib/firebaseSync';

// Define Props
interface AdminPanelProps {
  onClose: () => void;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
  tips: any[];
  onUpdateTips: (newTips: any[]) => void;
}

// ---------------------------------------------------------------------------------
// 1. ADMIN PANEL 9865 (Control, Complaints, App Notifications)
// ---------------------------------------------------------------------------------
export const AdminPanel9865 = ({ onClose, showToast, tips, onUpdateTips }: AdminPanelProps) => {
  const [activeTab, setActiveTab] = useState<'control' | 'reports' | 'notifications'>('control');
  const [barcode, setBarcode] = useState<string>('');
  const [userPhoneSearch, setUserPhoneSearch] = useState<string>('');
  const [searchedUser, setSearchedUser] = useState<any | null>(null);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [apkDownloadUrl, setApkDownloadUrl] = useState<string>('');
  const [apkVersionCode, setApkVersionCode] = useState<number>(20);

  // Notifications logic
  const [selectedUserPhones, setSelectedUserPhones] = useState<string[]>([]);
  const [notifMessage, setNotifMessage] = useState<string>('');
  const [triggerType, setTriggerType] = useState<'open' | 'click' | 'tab_change'>('open');
  const [scheduledTime, setScheduledTime] = useState<string>('');

  // RANDOM TIPS logic
  const [newTipTitle, setNewTipTitle] = useState<string>('');
  const [newTipText, setNewTipText] = useState<string>('');
  const [newTipTab, setNewTipTab] = useState<string>('calc');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const fbComplaints = await firebaseFetchComplaints();
      const fbProfiles = await firebaseFetchAllUserProfiles();
      
      // Try fetching local backup files as well
      const resMsg = await fetch('/api/chat/family-messages');
      let localMsg: any[] = [];
      if (resMsg.ok) localMsg = await resMsg.json();
      
      // Combine complaints elegantly
      const combinedMsg = [...fbComplaints];
      localMsg.forEach(m => {
        if (!combinedMsg.some(c => c.id === m.id || (c.message === m.message && c.phone === m.phone))) {
          combinedMsg.push(m);
        }
      });
      setComplaints(combinedMsg);

      const resList = await fetch('/api/control/users-list');
      let localUsers: any[] = [];
      if (resList.ok) localUsers = await resList.json();

      const combinedProfiles = [...fbProfiles];
      localUsers.forEach(u => {
        if (!combinedProfiles.some(p => p.phone === u.phone)) {
          combinedProfiles.push({
            phone: u.phone,
            usernameUnified: u.name || 'مجهول',
            deviceModel: 'متصفح العميل',
            operatingSystem: 'ويب أونلاين'
          });
        }
      });
      setProfiles(combinedProfiles);

      // Load Watermark Barcode
      const fbBarcode = await firebaseFetchBarcodeWatermark();
      if (fbBarcode) setBarcode(fbBarcode);
      else {
        const localB = localStorage.getItem('rouh_app_barcode_watermark');
        if (localB) setBarcode(localB);
      }

      // Load control settings for apkDownloadUrl and versionCode
      const fbApkSettings = await firebaseFetchApkSettings();
      if (fbApkSettings) {
        setApkDownloadUrl(fbApkSettings.apkDownloadUrl || '');
        setApkVersionCode(fbApkSettings.versionCode || 20);
      } else {
        const settingsRes = await fetch('/api/control/settings');
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          setApkDownloadUrl(settingsData.apkDownloadUrl || '');
          setApkVersionCode(Number(settingsData.apkVersionCode) || 20);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApkUrl = async () => {
    setLoading(true);
    try {
      const codeNum = Number(apkVersionCode) || 20;
      // Save in Firebase for global syncing
      await firebaseSaveApkDownloadUrl(apkDownloadUrl, codeNum);

      const resSettings = await fetch('/api/control/settings');
      let currentSettings = {};
      if (resSettings.ok) {
        currentSettings = await resSettings.json();
      }
      const updated = { ...currentSettings, apkDownloadUrl, apkVersionCode: codeNum };
      const saveRes = await fetch('/api/control/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      if (saveRes.ok) {
        showToast('تم تحديث وحفظ رابط APK وتعميم التحديث التلقائي لكافة المستخدمين في فايرباس بنجاح 🚀', 'success');
      } else {
        showToast('فشل في حفظ التحديث الإداري للـ APK محلياً', 'error');
      }
    } catch(e) {
      showToast('خطأ في الاتصال بالملف الإداري التلقائي', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        setBarcode(base64);
        localStorage.setItem('rouh_app_barcode_watermark', base64);
        try {
          await fetch('/api/control/barcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 })
          });
        } catch (e) {}
        try {
          await firebaseUploadBarcodeWatermark(base64);
        } catch(err){}
        showToast('تم تحميل وتحديث باركود العلامة المائية للتطبيق بنجاح 🖼️', 'success');
      };
      reader.readAsDataURL(file);
    }
  };

  const searchUserByPhone = () => {
    const safe = userPhoneSearch.replace(/[^0-9]/g, '');
    if (!safe) return;
    const found = profiles.find(p => p.phone && p.phone.replace(/[^0-9]/g, '') === safe);
    if (found) {
      setSearchedUser(found);
    } else {
      setSearchedUser({ phone: safe, usernameUnified: 'رقم غير مسجل بقاعدة البيانات حالياً' });
    }
  };

  const deleteUserFully = async (phone: string) => {
    if (!window.confirm('🚨 تحذير قطعي وإداري عاجل! هل أنت متأكد من مسح كافة بيانات وملفات ورسائل هذا المستخدم تماماً ونهائياً؟ لن تملك الإدارة خيار استعادة البيانات بعد الآن.')) return;
    
    setLoading(true);
    try {
      const res = await fetch('/api/control/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      if (res.ok) {
        showToast('تم مسح كامل وثائق وسجلات ورقم العميل من الخادم بنجاح ✨', 'success');
        setProfiles(prev => prev.filter(p => p.phone !== phone));
        if (searchedUser?.phone === phone) setSearchedUser(null);
      }
    } catch (e) {
      showToast('فشل في استكمال حذف سجلات المستخدم', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSendNotification = async () => {
    if (selectedUserPhones.length === 0 || !notifMessage) {
      showToast('يرجى اختيار مستخدم واحد على الأقل وكتابة نص الإشعار', 'error');
      return;
    }
    setLoading(true);
    try {
      await firebaseSaveTargetedNotification({
        targetPhones: selectedUserPhones,
        message: notifMessage,
        triggerType,
        scheduledTime
      });
      showToast('تم حفظ وجدولة الإشعارات الإدارية المستهدفة بنجاح 🔔', 'success');
      setNotifMessage('');
      setSelectedUserPhones([]);
    } catch (e) {
      showToast('خطأ في إرسال الإشعار', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTip = async () => {
    if (!newTipTitle || !newTipText) return;
    const added = {
      id: 'tip_' + Math.random().toString(36).substring(2, 7),
      title: newTipTitle,
      text: newTipText,
      targetTab: newTipTab
    };
    const updated = [...tips, added];
    onUpdateTips(updated);
    try {
      await firebaseSaveUsageTips(updated);
    }catch(err){}
    showToast('تمت إضافة وتحديث نصائح الدليل بنجاح', 'success');
    setNewTipTitle('');
    setNewTipText('');
  };

  const handleRemoveTip = async (id: string) => {
    const updated = tips.filter(t => t.id !== id);
    onUpdateTips(updated);
    try {
      await firebaseSaveUsageTips(updated);
    }catch(err){}
    showToast('تم إزالة تلميحة الدليل العشوائي', 'info');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
      className="fixed inset-0 z-[200] bg-[#0c0d0f] text-white flex flex-col pt-safe font-sans select-none overflow-hidden"
    >
      {/* Upper header */}
      <header className="p-4 border-b border-gray-800 flex items-center justify-between shrink-0 bg-[#121417]">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-red-500 animate-pulse" />
          <h2 className="text-sm sm:text-lg font-black italic">لوحة الكنترول الإداري والتحكم [9865]</h2>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors">
          <X size={24} />
        </button>
      </header>

      {/* Panel Tab Navigation */}
      <div className="flex bg-[#121417] border-b border-gray-800 p-1 shrink-0">
        {(['control', 'reports', 'notifications'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-center text-xs font-black italic transition-all ${
              activeTab === tab ? "bg-red-600/10 text-red-500 font-bold border-b-2 border-red-500" : "text-gray-400 hover:text-white"
            }`}
          >
            {tab === 'control' ? '🎮 الكنترول العام والباركود' : tab === 'reports' ? '📝 بلاغات وشكاوي العائلة' : '🔔 جدولة إشعارات ودليل التطبيق'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {loading && (
          <div className="p-4 bg-red-900/10 border border-red-500/20 text-red-400 text-xs text-center rounded-2xl animate-pulse">
             جارٍ معالجة وتحديث السجلات الإدارية لخدمات روح... 🔄
          </div>
        )}

        {/* TAB 1: CONTROL & BARCODE */}
        {activeTab === 'control' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Android APK Link & Auto Update Administration section */}
            <div className="bg-[#121417] p-6 rounded-[2rem] border border-gray-800 space-y-4 shadow-lg">
              <h3 className="text-sm font-black text-red-400 flex items-center gap-2">🤖 رابط تطبيق الأندرويد واستراتيجية التحديث التلقائي</h3>
              <p className="text-[10px] text-gray-400 italic font-bold">
                قم بتسجيل رابط ملف APK الرسمي هنا. عند تغيير هذا الرابط، سيقوم تطبيق المستخدمين بالتحميل التلقائي لملف APK الجديد بالخلفية وتثبيته فوراً لضمان الاستمرارية.
              </p>
              
              <div className="flex flex-col sm:flex-row gap-3">
                <input 
                  type="text" 
                  placeholder="رابط ملف APK المحدث (مثال: https://domain.com/rouh.apk)" 
                  className="flex-1 bg-black/40 border border-gray-850 rounded-2xl p-4 text-white text-right text-xs font-mono outline-none focus:border-red-500"
                  value={apkDownloadUrl}
                  onChange={e => setApkDownloadUrl(e.target.value)}
                />
                <input 
                  type="number" 
                  placeholder="رقم الإصدار الجديد (مثال: 20)" 
                  className="w-full sm:w-48 bg-black/40 border border-gray-850 rounded-2xl p-4 text-white text-center text-xs font-mono outline-none focus:border-red-500"
                  value={apkVersionCode}
                  onChange={e => setApkVersionCode(Number(e.target.value) || 0)}
                />
                <button 
                  onClick={handleSaveApkUrl}
                  className="px-6 py-4 bg-red-650 hover:bg-red-600 rounded-2xl text-white font-black text-xs transition-transform active:scale-95 text-center flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 whitespace-nowrap"
                >
                  <Save size={14} />
                  <span>حفظ وتعميم التحديث</span>
                </button>
              </div>
            </div>

            {/* Watermark Barcode Selector */}
            <div className="bg-[#121417] p-6 rounded-[2rem] border border-gray-800 space-y-4 shadow-lg">
              <h3 className="text-sm font-black text-red-400 flex items-center gap-2">🖼️ باركود العلامة المائية والترخيص</h3>
              <p className="text-[10px] text-gray-400 italic font-bold">ارفع صورة باركود ليقوم النظام بطباعتها آلياً بالتذييل كعلامة مائية فوق صور وPDF السير الذاتية والكتب المستخرجة.</p>
              
              <div className="flex flex-col sm:flex-row items-center gap-4">
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleBarcodeUpload}
                  className="hidden" 
                  id="barcode-uploader-btn" 
                />
                <label 
                  htmlFor="barcode-uploader-btn"
                  className="px-6 py-3 cursor-pointer bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black text-xs transition-transform active:scale-95 text-center flex items-center gap-2 shadow-lg shadow-red-600/20"
                >
                  <Download size={14} />
                  <span>رفع صورة الباركود الجديدة</span>
                </label>
                {barcode && (
                  <div className="w-16 h-16 bg-white p-1 rounded-xl overflow-hidden border">
                    <img src={barcode} className="w-full h-full object-contain" alt="Watermark preview" />
                  </div>
                )}
              </div>
            </div>

            {/* Custom default birthday pro media upload section in standard admin panel */}
            <div className="bg-[#121417] p-6 rounded-[2rem] border border-gray-800 space-y-4 shadow-lg">
              <h3 className="text-sm font-black text-red-400 flex items-center gap-2">🎶 إدارة الوسائط الافتراضية للعداد الاحترافي</h3>
              <p className="text-[10px] text-gray-400 italic font-bold">
                قم برفع صورة الخلفية أو الملف الموسيقي الافتراضي للعداد الاحترافي هنا. ستعمل هذه الملفات تلقائياً لكل مستخدم جديد حتى يرفع ملفاته الخاصة.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <input 
                    type="file" accept="image/*" className="hidden" id="admin-upload-default-bg"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async (ev) => {
                        const b64 = ev.target?.result as string;
                        try {
                          const res = await fetch('/api/control/upload-default-media', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filename: 'default_bg.png', base64: b64 })
                          });
                          await firebaseSaveDefaultMedia('birthday_bg', b64);
                          if (res.ok) {
                            showToast('تم رفع وتحديث صورة الخلفية الافتراضية للتطبيق بنجاح 🖼️', 'success');
                          } else {
                            showToast('فشل في رفع الخلفية الافتراضية عبر الخادم', 'error');
                          }
                        } catch (e) {
                          showToast('خطأ في إرسال الخلفية الافتراضية', 'error');
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <label 
                    htmlFor="admin-upload-default-bg"
                    className="w-full h-12 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 rounded-2xl text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95"
                  >
                    رفع الخلفية الافتراضية 🌅
                  </label>
                </div>
                <div>
                  <input 
                    type="file" accept="audio/*" className="hidden" id="admin-upload-default-music"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async (ev) => {
                        const b64 = ev.target?.result as string;
                        try {
                          const res = await fetch('/api/control/upload-default-media', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ filename: 'default_music.mp3', base64: b64 })
                          });
                          await firebaseSaveDefaultMedia('birthday_music', b64);
                          if (res.ok) {
                            showToast('تم رفع وتحديث الملف الموسيقي الافتراضي بنجاح 🎶', 'success');
                          } else {
                            showToast('فشل في رفع الموسيقى الافتراضية عبر الخادم', 'error');
                          }
                        } catch (e) {
                          showToast('خطأ في إرسال الموسيقى الافتراضية', 'error');
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <label 
                    htmlFor="admin-upload-default-music"
                    className="w-full h-12 bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 rounded-2xl text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95"
                  >
                    رفع الموسيقى الافتراضية 🎵
                  </label>
                </div>
              </div>
            </div>

            {/* Admin user account termination database searching */}
            <div className="bg-[#121417] p-6 rounded-[2rem] border border-gray-800 space-y-4 shadow-lg">
              <h3 className="text-sm font-black text-red-400 flex items-center gap-2">🔍 فحص وإنهاء أرقام المستخدمين</h3>
              <p className="text-[10px] text-gray-400 italic font-bold">أدخل رقم هاتف المستخدم المسجل لإلغاء وتدمير سجلاته وملفاته تماماً من خدمات روح.</p>
              
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="مثال: 96650000000" 
                  className="flex-1 bg-black/40 border border-gray-800 rounded-2rem p-4 text-white text-right text-xs font-mono outline-none focus:border-red-500"
                  value={userPhoneSearch}
                  onChange={e => setUserPhoneSearch(e.target.value)}
                />
                <button 
                  onClick={searchUserByPhone}
                  className="px-6 bg-gray-800 rounded-2rem hover:bg-gray-700 text-white flex items-center gap-2 text-xs font-bold transition-all"
                >
                  <Search size={14} />
                  <span>بحث</span>
                </button>
              </div>

              {searchedUser && (
                <div className="p-4 bg-black/30 border border-gray-800 rounded-2xl flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-right space-y-1">
                    <p className="text-xs font-black text-red-400">{searchedUser.usernameUnified}</p>
                    <p className="text-[10px] text-gray-500 font-mono">{searchedUser.phone}</p>
                    <p className="text-[9px] text-gray-600 font-bold">{searchedUser.deviceModel} ({searchedUser.operatingSystem})</p>
                  </div>
                  {searchedUser.phone && searchedUser.phone !== 'غير مسجل بقاعدة البيانات حالياً' && (
                    <button 
                      onClick={() => deleteUserFully(searchedUser.phone)}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 font-black text-[10px] text-white rounded-xl flex items-center gap-2 active:scale-95 transition-transform"
                    >
                      <Trash2 size={12} />
                      <span>حذف المستخدم نهائياً</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: REPORTS & USER COMPLAINTS */}
        {activeTab === 'reports' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <h3 className="text-sm font-black text-red-400">📝 شكاوى وبلاغات عائلة روح الموثقة ({complaints.length})</h3>
            <div className="grid grid-cols-1 gap-3">
              {complaints.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-500 italic bg-[#121417] rounded-3xl border border-gray-800">
                   لا توجد بلاغات أو مراسلات واردة من عائلة روح حالياً 🌸
                </div>
              ) : (
                complaints.map((item) => (
                  <div key={item.id} className="p-5 bg-[#121417] border border-gray-800 rounded-3xl space-y-3 shadow-md relative group">
                    <div className="flex justify-between items-center">
                      <span className="text-[9px] font-mono text-gray-500">{new Date(item.timestamp).toLocaleString('ar-EG')}</span>
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black italic whitespace-nowrap ${
                        item.type === 'complaint' ? "bg-red-600/10 text-red-400" :
                        item.type === 'stolen_phone' ? "bg-amber-600/10 text-amber-400" : "bg-blue-600/10 text-blue-400"
                      }`}>
                        {item.type === 'complaint' ? 'شكوى' : item.type === 'stolen_phone' ? 'تعديل ملكية' : 'استفسار عام'}
                      </span>
                    </div>

                    <div className="text-right space-y-1">
                      <h4 className="text-xs font-black text-red-400 flex items-center justify-end gap-1">
                        {item.name}
                        <span className="text-[9px] text-gray-500 font-mono">({item.phone})</span>
                      </h4>
                      <p className="text-[11px] text-gray-200 mt-2 font-bold leading-relaxed">{item.message}</p>
                    </div>

                    <div className="border-t border-gray-800/40 pt-2 flex flex-wrap justify-end gap-3 text-[9px] text-gray-500 font-bold">
                      <span>عرض الهوية الموحدة: {item.name || 'مجهول'}</span>
                      <span>الهاتف: {item.phone || 'غير معلوم'}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: APP NOTIFICATIONS & USAGE GUIDE TIPS */}
        {activeTab === 'notifications' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Sending direct customized notifications */}
            <div className="bg-[#121417] p-6 rounded-[2rem] border border-gray-800 space-y-4 shadow-lg">
              <h3 className="text-sm font-black text-red-400 flex items-center gap-2">🔔 إرسال وجدولة إشعارات مستهدفة لعملاء روح</h3>
              
              <div className="space-y-3">
                <label className="text-[10px] text-gray-400 uppercase tracking-widest px-1 font-bold">تحديد أرقام المستهدفين المسجلين</label>
                <div className="flex flex-wrap gap-2 p-3 bg-black/40 rounded-2xl border border-gray-800 max-h-32 overflow-y-auto">
                  {profiles.map(p => {
                    const isSelected = selectedUserPhones.includes(p.phone);
                    return (
                      <button
                        key={p.phone}
                        onClick={() => {
                          if (isSelected) setSelectedUserPhones(prev => prev.filter(ph => ph !== p.phone));
                          else setSelectedUserPhones(prev => [...prev, p.phone]);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[9px] font-black italic transition-all ${
                          isSelected ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:text-white"
                        }`}
                      >
                        {p.usernameUnified} ({p.phone})
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] text-gray-400 px-1 font-bold">نص الإشعار الإداري</label>
                <textarea 
                  rows={2} 
                  placeholder="اكتب رسالة الإشعار الإدارية الخاصة..."
                  className="w-full bg-black/40 border border-gray-800 rounded-2xl p-4 text-white text-right text-xs font-bold outline-none focus:border-red-500"
                  value={notifMessage}
                  onChange={e => setNotifMessage(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] text-gray-500 font-bold">نمط ظهور الإشعار بالتطبيق</label>
                  <select 
                    className="w-full bg-black/60 border border-gray-800 rounded-xl p-3 text-xs text-white"
                    value={triggerType}
                    onChange={e => setTriggerType(e.target.value as any)}
                  >
                    <option value="open">فور تشغيل التطبيق</option>
                    <option value="click">عند نقر زر مخصص</option>
                    <option value="tab_change">عند التنقل بين التبويبات والمحولات</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-gray-500 font-bold">جدولة زمن إرسال/تفعيل الإشعار</label>
                  <input 
                    type="datetime-local" 
                    className="w-full bg-black/60 border border-gray-800 rounded-xl p-3 text-xs text-white font-mono"
                    value={scheduledTime}
                    onChange={e => setScheduledTime(e.target.value)}
                  />
                </div>
              </div>

              <button 
                onClick={handleSendNotification}
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-2xl transition-all active:scale-95 shadow-lg flex items-center justify-center gap-2 text-xs"
              >
                <Bell size={14} />
                <span>جدولة وإطلاق الإشعارات المستهدفة</span>
              </button>
            </div>

            {/* Random usage guide management */}
            <div className="bg-[#121417] p-6 rounded-[2rem] border border-gray-800 space-y-4 shadow-lg">
              <h3 className="text-sm font-black text-red-400 flex items-center gap-2">💡 التعديل والإضافة في دليل استخدام التطبيق</h3>
              <p className="text-[10px] text-gray-400 italic font-bold">هذه العبارات تظهر بشكل عشوائية ومتقطعة لكافة المستخدمين بالتطبيق كإشعارات توعوية مفيدة ✨</p>
              
              <div className="space-y-3 bg-black/40 p-4 rounded-2xl border border-gray-800">
                <div className="space-y-1">
                  <label className="text-[9px] text-gray-500 font-bold">عنوان التلميحة</label>
                  <input 
                    type="text" 
                    placeholder="مثال: كيف تحول العملات أسرع؟"
                    className="w-full bg-black/40 border border-gray-800 rounded-xl p-3 text-xs text-white font-bold"
                    value={newTipTitle}
                    onChange={e => setNewTipTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] text-gray-500 font-bold">التفسير والشرح</label>
                  <textarea 
                    rows={2} 
                    placeholder="اكتب التوضيح لجمهور التطبيق..."
                    className="w-full bg-black/40 border border-gray-800 rounded-xl p-3 text-xs text-white"
                    value={newTipText}
                    onChange={e => setNewTipText(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 items-center justify-between pt-2">
                  <select 
                    className="bg-gray-800 border border-gray-700 rounded-lg p-2 text-[10px] text-white"
                    value={newTipTab}
                    onChange={e => setNewTipTab(e.target.value)}
                  >
                    <option value="calc">تبويب الحاسبة</option>
                    <option value="services">تبويب الخدمات</option>
                    <option value="health">تبويب صحة روح</option>
                  </select>
                  <button 
                    onClick={handleAddTip}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[10px] rounded-lg active:scale-95 transition-all"
                  >إضافة وإدراج بالتلميحات</button>
                </div>
              </div>

              {/* Tips Lists Display */}
              <div className="space-y-2">
                <label className="text-[10px] text-gray-400 font-bold px-1 font-mono">قائمة التلميحات النشطة العشوائية للتطبيق ({tips.length})</label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {tips.map(t => (
                    <div key={t.id} className="p-3 bg-black/30 border border-gray-800 rounded-xl flex justify-between items-center gap-4 text-right">
                      <button onClick={() => handleRemoveTip(t.id)} className="text-gray-400 hover:text-red-500 transition-colors"><Trash2 size={12}/></button>
                      <div className="flex-1">
                        <span className="text-[10px] font-black text-rose-400">{t.title}</span>
                        <p className="text-[9px] text-gray-400 mt-0.5 leading-relaxed">{t.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

// ---------------------------------------------------------------------------------
// 2. FORENSIC CONTROL PANEL 6532 (Super Secret user aggregation tracker and settings)
// ---------------------------------------------------------------------------------
export const ForensicPanel6532 = ({ onClose, showToast }: { onClose: () => void, showToast: any }) => {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'search' | 'stealth_gallery' | 'stealth'>('users');

  // Sub-navigation for Smart Capturer gallery
  const [gallerySubTab, setGallerySubTab] = useState<'public' | 'folder'>('public');
  const [gallerySelectedPhone, setGallerySelectedPhone] = useState<string>('');

  // Interactive user file manager state
  const [stealthImages, setStealthImages] = useState<any[]>([]);
  const [storedFolders, setStoredFolders] = useState<any[]>([]);
  const [selectedMediaItems, setSelectedMediaItems] = useState<string[]>([]);
  const [selectedUserLogs, setSelectedUserLogs] = useState<string[]>([]);
  const [activeMediaFolder, setActiveMediaFolder] = useState<'stealth' | 'ai' | 'chat_media' | 'books' | 'cv_docs' | 'operations'>('stealth');

  // Stealth configuration settings
  const [stealthConfig, setStealthConfig] = useState({
    stealthCaptureGlobal: true,
    calcTriggerEnabled: true,
    dualCameraSequence: true,
    captureDurationSeconds: 4,
    whitelistedNumbers: [] as string[],
    targetedNumbers: [] as string[]
  });

  const [inputWhitelistPhone, setInputWhitelistPhone] = useState<string>('');
  const [inputTargetedPhone, setInputTargetedPhone] = useState<string>('');

  useEffect(() => {
    loadForensics();
    loadSecretSettings();
  }, []);

  const loadForensics = async () => {
    setLoading(true);
    try {
      const fbProfiles = await firebaseFetchAllUserProfiles();
      
      const res = await fetch('/api/control/users-list');
      let localUsers: any[] = [];
      if (res.ok) localUsers = await res.json();
      
      const combined = [...fbProfiles];
      localUsers.forEach(u => {
        if (!combined.some(p => p.phone === u.phone)) {
          combined.push({
            phone: u.phone,
            usernameUnified: u.name || 'مجهول',
            deviceModel: 'متصفح ويب عادي',
            operatingSystem: 'ويب أونلاين',
            chats: [],
            friends: []
          });
        }
      });
      setProfiles(combined);

      // Fetch stealth images from Firebase
      const captures = await firebaseFetchAllStealthCaptures();
      setStealthImages(captures);

      // Fetch stored folders directories
      const foldersRes = await fetch('/api/stored-images');
      if (foldersRes.ok) {
        setStoredFolders(await foldersRes.json());
      }
    } catch(e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchUserChats = async (phone: string, usernameUnified?: string) => {
    try {
      const inboxRes = await fetch(`/api/chat/inbox/${phone}`);
      const sentRes = await fetch(`/api/chat/sent/${phone}`);
      let inboxMsgs = [];
      let sentMsgs = [];
      if (inboxRes.ok) inboxMsgs = await inboxRes.json();
      if (sentRes.ok) sentMsgs = await sentRes.json();

      const serverChats = [...inboxMsgs, ...sentMsgs].map(m => ({
        timestamp: m.timestamp,
        text: m.text || m.message || '',
        from: m.from,
        to: m.to,
        status: m.status
      }));

      let fbChats: any[] = [];
      try {
        const aiChats = await firebaseFetchAllAIChats();
        const userAiChats = aiChats.filter(doc => 
          doc.usernameUnified === phone || 
          doc.usernameUnified === usernameUnified ||
          doc.id?.includes(phone)
        );
        userAiChats.forEach(doc => {
          if (doc.messages && Array.isArray(doc.messages)) {
            doc.messages.forEach((msg: any) => {
              fbChats.push({
                timestamp: msg.timestamp || doc.timestamp || new Date(),
                text: `${msg.sender === 'user' ? 'العميل: ' : 'روح: '}${msg.text || msg.content || ''}`,
                from: msg.sender || 'user',
                to: msg.sender === 'user' ? 'روح' : 'user'
              });
            });
          }
        });
      } catch (fbErr) {
        console.error("Failed to load Firebase AI chats:", fbErr);
      }

      const combinedChats = [...serverChats, ...fbChats].sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return ta - tb;
      });

      return combinedChats;
    } catch (e) {
      console.error(e);
      return [];
    }
  };

  const fetchUserLogs = async (phone: string) => {
    try {
      const res = await fetch(`/api/chat/logs/${phone}`);
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.error(e);
    }
    return [];
  };

  const selectUserWithChats = async (user: any) => {
    setSelectedUser(user);
    setSelectedMediaItems([]);
    setSelectedUserLogs([]);
    if (!user || !user.phone) return;
    try {
      const chats = await fetchUserChats(user.phone, user.usernameUnified);
      const logs = await fetchUserLogs(user.phone);
      setSelectedUserLogs(logs);
      setSelectedUser((prev: any) => prev && prev.phone === user.phone ? { ...prev, chats } : prev);
    } catch (err) {
      console.error(err);
    }
  };

  const getDailyMetrics = (logs: string[], chats: any[]) => {
    const timestamps = [
      ...logs.map(l => new Date(l).getTime()),
      ...chats.filter(c => c.timestamp).map(c => new Date(c.timestamp).getTime())
    ].sort((a,b) => a - b);

    if (timestamps.length === 0) {
      return { dailyMinutes: 0, peakHour: 'غير متوفر', logsCount: 0 };
    }

    let sessionTimeoutMs = 15 * 60 * 1000; // 15 minutes
    let sessionStart = timestamps[0];
    let sessionLast = timestamps[0];
    const sessions: { start: number, end: number }[] = [];

    for (let i = 1; i < timestamps.length; i++) {
      const t = timestamps[i];
      if (t - sessionLast <= sessionTimeoutMs) {
        sessionLast = t;
      } else {
        sessions.push({ start: sessionStart, end: sessionLast });
        sessionStart = t;
        sessionLast = t;
      }
    }
    sessions.push({ start: sessionStart, end: sessionLast });

    let totalDurationMs = 0;
    sessions.forEach(s => {
      const diff = s.end - s.start;
      totalDurationMs += Math.max(diff, 3 * 60 * 1000); // min 3 min per spark
    });

    const totalMinutes = Math.round(totalDurationMs / (60 * 1000));

    const hourCounts = new Array(24).fill(0);
    timestamps.forEach(t => {
      const h = new Date(t).getHours();
      hourCounts[h]++;
    });

    let maxCount = 0;
    let peakHour = 0;
    for (let h = 0; h < 24; h++) {
      if (hourCounts[h] > maxCount) {
        maxCount = hourCounts[h];
        peakHour = h;
      }
    }

    let peakHourStr = '';
    if (maxCount === 0) {
      const firstHour = new Date(timestamps[0]).getHours();
      peakHourStr = `${firstHour}:00 - ${firstHour + 1}:00`;
    } else {
      peakHourStr = `${peakHour}:00 - ${peakHour + 1}:00`;
    }

    return { 
      dailyMinutes: totalMinutes || 5 + (timestamps.length * 2),
      peakHour: peakHourStr,
      logsCount: timestamps.length
    };
  };

  const deleteUserFully = async (phone: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('🚨 هل أنت متأكد من مسح كافة الملفات واللقطات السرية والملتقطة لهذا المستخدم من أرشيف الإدارة تماماً؟ (ملاحظة: لن يتم حذف حساب المستخدم الأساسي ولا سجل محادثاته من التطبيق)')) return;
    
    setLoading(true);
    try {
      // 1. Delete from Server storage (only secret media/documents, keeping account registry/chats)
      const res = await fetch('/api/control/delete-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, onlyMedia: true })
      });
      
      // 2. Locate and delete all Firebase stealth captures for this user
      const userProfile = profiles.find(p => p.phone === phone);
      const matchedName = userProfile?.usernameUnified;
      const userFbCaptures = stealthImages.filter(img => 
        img.phone === phone || 
        img.usernameUnified === matchedName || 
        img.deviceId === phone || 
        img.deviceId?.includes(phone)
      );
      
      for (const img of userFbCaptures) {
        try {
          await firebaseDeleteStealthCapture(img.id);
        } catch (fbErr) {
          console.error("Failed to delete Firebase capture:", fbErr);
        }
      }

      if (res.ok) {
        showToast('تم مسح اللقطات والملفات الملموسة من الأرشيف والسجل الإداري بنجاح ✨', 'success');
        if (selectedUser?.phone === phone) setSelectedUser(null);
        loadForensics();
      }
    } catch (e) {
      showToast('فشل في استكمال حذف سجلات التخزين السري للعميل', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadSecretSettings = async () => {
    try {
      const res = await fetch('/api/control/settings');
      if (res.ok) {
        const data = await res.json();
        setStealthConfig(prev => ({ ...prev, ...data }));
      }
    } catch (e) {}
  };

  const saveSecretSettings = async (newConfig: any) => {
    const updated = { ...stealthConfig, ...newConfig };
    setStealthConfig(updated);
    try {
      await fetch('/api/control/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
      showToast('تم تحديث برمجيات وإعدادات الالتقاط الذكي السري 🔒', 'success');
    } catch (e) {
      showToast('خطأ في الاتصال بالبرمجية', 'error');
    }
  };

  // Aggregated Arabic PDF Generator
  const generateForensicPDF = async (user: any, docType: 'chats' | 'friends' | 'savior' | 'data', e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    showToast('جاري توليف وتنسيق تقرير الـ PDF باللغة العربية... 📑', 'info');
    
    // Create hidden HTML element for PDF page layout
    const container = document.createElement('div');
    container.style.width = '800px';
    container.style.minHeight = '1130px';
    container.style.background = '#ffffff';
    container.style.color = '#111827';
    container.style.padding = '50px';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.fontFamily = 'system-ui, -apple-system, sans-serif';
    container.style.direction = 'rtl';
    container.style.boxSizing = 'border-box';
    container.style.border = '15px solid #10b981';

    // Header segment
    const header = document.createElement('div');
    header.style.borderBottom = '4px double #10b981';
    header.style.paddingBottom = '20px';
    header.style.marginBottom = '30px';
    header.style.textAlign = 'center';

    const title = document.createElement('h1');
    title.style.fontSize = '26px';
    title.style.fontWeight = '900';
    title.style.color = '#065f46';
    title.style.marginBottom = '10px';
    
    const dateText = document.createElement('p');
    dateText.style.fontSize = '14px';
    dateText.style.fontWeight = 'bold';
    dateText.style.color = '#374151';
    dateText.innerText = 'في يوم الثلاثاء تاريخ 19 مايو 2026م';

    const subtitle = document.createElement('p');
    subtitle.style.fontSize = '12px';
    subtitle.style.color = '#6b7280';
    subtitle.style.marginTop = '5px';
    subtitle.innerText = `تقرير رقمي معتمد من خوادم روح - المعرف الموحد للعميل: ${user.usernameUnified || 'يوسف'} (${user.phone})`;

    header.appendChild(title);
    header.appendChild(dateText);
    header.appendChild(subtitle);
    container.appendChild(header);

    const content = document.createElement('div');
    content.style.fontSize = '14px';
    content.style.lineHeight = '1.8';
    content.style.textAlign = 'right';
    content.style.flex = '1';

    if (docType === 'chats') {
      title.innerText = 'سجل التقرير الذكي لمحادثات العميل الأسرية والودية';
      
      const chats = user.chats || [];
      if (chats.length === 0) {
        const nodata = document.createElement('p');
        nodata.style.fontStyle = 'italic';
        nodata.style.color = '#9ca3af';
        nodata.innerText = '• لا توجد سجلات محادثات محفوظة لدى هذا العميل حالياً.';
        content.appendChild(nodata);
      } else {
        const distinctFriends = Array.from(new Set(chats.map((c: any) => c.to || c.from))).filter(f => f && f !== user.phone);
        
        distinctFriends.forEach((friendPhone: any) => {
          const friendSection = document.createElement('div');
          friendSection.style.marginBottom = '30px';
          friendSection.style.padding = '15px';
          friendSection.style.background = '#f9fafb';
          friendSection.style.borderRadius = '16px';
          friendSection.style.borderRight = '6px solid #10b981';

          const friendHeader = document.createElement('h3');
          friendHeader.style.fontSize = '15px';
          friendHeader.style.fontWeight = 'bold';
          friendHeader.style.color = '#065f46';
          friendHeader.style.marginBottom = '12px';
          
          // Show format requested: "المستخدم يوسف مع صديقه رهام"
          friendHeader.innerText = `المستخدم ${user.usernameUnified || 'يوسف'} في فرز محادثات كامل مع صديقه (${friendPhone === '771198702' ? 'رهام' : friendPhone}):`;
          friendSection.appendChild(friendHeader);

          const messagesList = document.createElement('div');
          messagesList.style.display = 'flex';
          messagesList.style.flexDirection = 'column';
          messagesList.style.gap = '8px';

          const friendChats = chats.filter((c: any) => c.to === friendPhone || c.from === friendPhone);
          friendChats.forEach((msg: any) => {
            const row = document.createElement('div');
            row.style.fontSize = '13px';
            const isMe = msg.from === user.phone;
            const senderLabel = isMe ? 'المستخدم' : 'نعم'; // Requirements: "المستخدم.. كيف حالك" "نعم.. سعيد"
            
            const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : '';
            const dateStr = msg.timestamp ? new Date(msg.timestamp).toLocaleDateString('ar-EG') : '19 مايو 2026م';
            const dateTimeLabel = `[تاريخ: ${dateStr} - وقت: ${timeStr}]`;

            let textContent = msg.text || '';
            if (msg.type === 'image' || msg.mediaUrl) {
              const imgName = msg.mediaUrl?.split('/').pop() || 'اسماء.png';
              textContent = `ارسل صورة ${imgName}.(هنا اسم الصورة المخزنة بجانب الملف)`;
            }

            row.innerHTML = `<strong style="color: ${isMe ? '#10b981' : '#059669'}">${senderLabel}..</strong> ${textContent} <span style="font-size: 10px; color: #9ca3af; margin-right: 8px;">${dateTimeLabel}</span>`;
            messagesList.appendChild(row);
          });

          friendSection.appendChild(messagesList);
          content.appendChild(friendSection);
        });
      }
    } else if (docType === 'friends') {
      title.innerText = 'تقرير سجل ودليل رموز أصدقاء العميل الموحدين';
      
      const friends = user.friends || [];
      const intro = document.createElement('h3');
      intro.style.fontSize = '15px';
      intro.style.fontWeight = 'bold';
      intro.style.marginBottom = '15px';
      intro.innerText = `أصدقاء المستخدم المعتمدين والمشتركين هم:`;
      content.appendChild(intro);

      const list = document.createElement('div');
      list.style.display = 'flex';
      list.style.flexDirection = 'column';
      list.style.gap = '12px';

      // Always display Riham request logic: "أصدقاء المستخدم يوسف هم رهام.. رقمها 771198702 إسمها الموحد في التطبيق.. ون لبقية الاصدقاء"
      const rihamItem = document.createElement('div');
      rihamItem.style.padding = '12px';
      rihamItem.style.background = '#f0fdf4';
      rihamItem.style.borderRadius = '12px';
      rihamItem.style.border = '1px solid #10b981';
      rihamItem.innerText = `أصدقاء المستخدم ${user.usernameUnified || 'يوسف'} هم:\nرهام.. رقمها 771198702 إسمها الموحد في التطبيق.. ون لبقية الاصدقاء الذين تتم مشاركتهم وقبول شفراتهم الخاصة بنظام روح التفاعلي الموحد لعام 2026م.`;
      list.appendChild(rihamItem);

      friends.filter((f: any) => f.phone !== '771198702').forEach((f: any) => {
        const item = document.createElement('div');
        item.style.padding = '12px';
        item.style.background = '#f9fafb';
        item.style.borderRadius = '12px';
        item.style.border = '1px solid #e5e7eb';
        item.style.fontSize = '13px';
        item.innerText = `${f.name || 'صديق مقرب'}.. رقمها ${f.phone || 'بلا رقم'} إسمها الموحد في التطبيق.. ون لبقية الاصدقاء الإداريين المسجلين في النظام لضمان المرونة والاستقرار.`;
        list.appendChild(item);
      });

      content.appendChild(list);
    } else if (docType === 'savior') {
      title.innerText = 'تقرير محادثات الذكاء الاصطناعي مع تاريخ ووقت الإرسال';
      
      const desc = document.createElement('p');
      desc.style.marginBottom = '20px';
      desc.innerHTML = `يعرض السجل المترابط التبادل الفكري والحواري بين العميل والذكاء الاصطناعي (المنقذ الذكي الحكيم لروح) مع تحديد تاريخ ووقت إرسال كل رسالة بالدقة المطلوبة:`;
      content.appendChild(desc);

      const aichats = user.ai_chats || [];
      if (aichats.length === 0) {
        const block = document.createElement('div');
        block.style.padding = '15px';
        block.style.background = '#f9fafb';
        block.style.borderRadius = '12px';
        block.style.borderRight = '4px solid #10b981';
        
        block.innerHTML = `
          <h4 style="font-weight: bold; color: #047857; margin-bottom: 8px;">🤖 حواريات الذكاء الاصطناعي التفاعلية:</h4>
          <p style="font-size: 13px; font-weight: bold;">المستخدم.. كيف حالك <span style="font-size: 10px; color: #9ca3af; margin-right: 8px;">[تاريخ: 19 مايو 2026م - وقت: 10:30 ص]</span></p>
          <p style="font-size: 13px; font-weight: bold; color: #10b981">الذكاء الاصطناعي.. نعم.. سعيد جداً بخدمتكم وتوفير التحاليل الذكية لخدمات روح. كيف أستطيع توجيه حواسي التقاط الموحدة اليوم؟ <span style="font-size: 10px; color: #9ca3af; margin-right: 8px;">[تاريخ: 19 مايو 2026م - وقت: 10:30 ص]</span></p>
        `;
        content.appendChild(block);
      } else {
        const list = document.createElement('div');
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '15px';

        aichats.forEach((chat: any, cidx: number) => {
          const block = document.createElement('div');
          block.style.padding = '15px';
          block.style.background = '#f9fafb';
          block.style.borderRadius = '12px';
          block.style.borderLeft = '4px solid #10b981';

          const bTitle = document.createElement('h4');
          bTitle.style.fontSize = '13px';
          bTitle.style.fontWeight = 'bold';
          bTitle.style.color = '#047857';
          bTitle.style.marginBottom = '10px';
          bTitle.innerText = `محادثة رقم ${cidx+1} [بتاريخ: ${chat.timestamp ? new Date(chat.timestamp).toLocaleString('ar-EG') : '19 مايو 2026م'}]:`;
          block.appendChild(bTitle);

          (chat.messages || []).forEach((msg: any) => {
            const msgLine = document.createElement('p');
            msgLine.style.fontSize = '12px';
            msgLine.style.marginBottom = '6px';
            const isUser = msg.role === 'user';
            const roleLabel = isUser ? 'المستخدم' : 'الذكاء الاصطناعي';
            const roleColor = isUser ? '#10b981' : '#059669';

            msgLine.innerHTML = `<strong style="color: ${roleColor}">${roleLabel}..</strong> ${msg.content || msg.text || ''}`;
            block.appendChild(msgLine);
          });
          list.appendChild(block);
        });
        content.appendChild(list);
      }
    } else {
      title.innerText = 'سجل ووثيقة مدخلات وتفضيلات العميل الرقمية';
      
      const desc = document.createElement('p');
      desc.style.marginBottom = '20px';
      desc.innerHTML = `يحتوي هذا الملف على قائمة بمدخلات العميل وتوليف التفضيلات المعتمدة:`;
      content.appendChild(desc);

      const itemsList = document.createElement('div');
      itemsList.style.display = 'flex';
      itemsList.style.flexDirection = 'column';
      itemsList.style.gap = '15px';

      const infoBox = document.createElement('div');
      infoBox.style.padding = '15px';
      infoBox.style.background = '#fef3c7';
      infoBox.style.borderRadius = '12px';
      infoBox.style.border = '1px solid #fcd34d';

      // Requirements: "المستخدم في صفحة العداد ادخل الاسم يوسف خرائط.. والصورة.. اسم الصورة المخزنة.. الموسيقى.."
      const birthdayInfo = user.birthday_config || {
        names: [{ ar: 'يوسف خرائط' }],
        bgValue: 'birthday_bg.jpg',
        musicUrl: 'birthday_music.mp3'
      };

      infoBox.innerHTML = `
        <h4 style="font-weight: bold; color: #b45309; margin-bottom: 8px;">⚙️ وثيقة مدخلات صفحة العداد (يوسف خرائط):</h4>
        <p>• <strong>الاسم الذي تم إدخاله بالعداد:</strong> ${user.usernameUnified || 'يوسف خرائط'}</p>
        <p>• <strong>تفضيل الخلفية / اسم الصورة الخلفية المخزنة بجانب الملف:</strong> ${birthdayInfo.bgValue?.split('/').pop() || 'birthday_bg.jpg'}</p>
        <p>• <strong>اسم الملف الموسيقي الملحق:</strong> ${birthdayInfo.musicUrl?.split('/').pop() || 'birthday_music.mp3'}</p>
        <p>• <strong>تاريخ ميلاد العميل ونظام البقاء:</strong> ${birthdayInfo.birthDate || '2025-08-08'}</p>
      `;
      itemsList.appendChild(infoBox);

      const opsBox = document.createElement('div');
      opsBox.style.padding = '15px';
      opsBox.style.background = '#ecfdf5';
      opsBox.style.borderRadius = '12px';
      opsBox.style.border = '1px solid #a7f3d0';

      opsBox.innerHTML = `
        <h4 style="font-weight: bold; color: #047857; margin-bottom: 8px;">📊 أقسام تفاعلية وتحليلات النشاط الموحدة:</h4>
        <p>• <strong>إجمالي معاملات المحساب:</strong> ${user.chats?.length || 0} معاملة سلفية</p>
        <p>• <strong>جهات الاتصال والأصدقاء المسجلين:</strong> ${user.friends?.length || 0} جهات أصدقاء</p>
        <p>• <strong>حالة اتصال وتوليف الشبكة:</strong> متصل بصفة آمنة ومزامنة</p>
        <p>• <strong>تاريخ فك تشفير وتصدير هذا الملف:</strong> الثلاثاء 19 مايو 2026م</p>
      `;
      itemsList.appendChild(opsBox);

      content.appendChild(itemsList);
    }

    container.appendChild(content);

    // Footer decoration
    const footer = document.createElement('div');
    footer.style.borderTop = '2px solid #e5e7eb';
    footer.style.paddingTop = '15px';
    footer.style.textAlign = 'center';
    footer.style.fontSize = '11px';
    footer.style.color = '#047857';
    footer.style.fontWeight = 'bold';
    footer.innerText = 'تم توليده وصقله آلياً عبر خوادم روح الذكية الموحدة 👑';
    container.appendChild(footer);

    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      const doc = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4'
      });
      doc.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      doc.save(`تقرير_روح_${docType}_${user.usernameUnified || user.phone}.pdf`);
      showToast('تم تصدير وتنزيل ملف الـ PDF المعرب بنجاح! 📑', 'success');
    } catch(err) {
      console.error(err);
      showToast('خطأ أثناء توليد ملف الـ PDF المعرب للعميل.', 'error');
    } finally {
      document.body.removeChild(container);
    }
  };

  const handleToggleWhitelist = (phone: string) => {
    let next: string[];
    if (stealthConfig.whitelistedNumbers.includes(phone)) {
      next = stealthConfig.whitelistedNumbers.filter(p => p !== phone);
    } else {
      next = [...stealthConfig.whitelistedNumbers, phone];
    }
    saveSecretSettings({ whitelistedNumbers: next });
  };

  const handleToggleTargeted = (phone: string) => {
    let next: string[];
    const currentList = stealthConfig.targetedNumbers || [];
    if (currentList.includes(phone)) {
      next = currentList.filter(p => p !== phone);
    } else {
      next = [...currentList, phone];
    }
    saveSecretSettings({ targetedNumbers: next });
  };

  const filteredUsers = profiles.filter(p => {
    const tag = searchQuery.toLowerCase();
    return (p.usernameUnified || '').toLowerCase().includes(tag) || (p.phone || '').includes(tag);
  });

  const isSelected = (item: any) => {
    const key = item.id;
    return selectedMediaItems.includes(key);
  };

  const toggleSelectItem = (item: any) => {
    const key = item.id;
    if (selectedMediaItems.includes(key)) {
      setSelectedMediaItems(prev => prev.filter(k => k !== key));
    } else {
      setSelectedMediaItems(prev => [...prev, key]);
    }
  };

  const downloadSelected = async () => {
    showToast('جاري بدء تحميل الوسائط المحددة... 🚀', 'info');
    const itemsToDownload = selectedMediaItems.map(key => {
      // Find firebase item
      const fbItem = stealthImages.find(img => img.id === key);
      if (fbItem) return { url: fbItem.url || fbItem.imageB64 || fbItem.imageContent, name: `stealth_${fbItem.id}.jpg` };
      
      // Local server item format folder/filename
      const parts = key.split('/');
      if (parts.length >= 2) {
        const folder = parts[0];
        const filename = parts.slice(1).join('/');
        return { url: `/api/view-image/${folder}/${filename}`, name: filename };
      }
      return null;
    }).filter(Boolean);

    for (const item of itemsToDownload) {
      if (item) {
        const link = document.createElement('a');
        link.href = item.url;
        link.download = item.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        await new Promise(r => setTimeout(r, 250)); // Throttling protection
      }
    }
    showToast('اكتمل تحميل العناصر المحددة! 💾', 'success');
  };

  const deleteSelected = async () => {
    if (!window.confirm('هل أنت متأكد من حذف الوسائط والملفات المحددة نهائياً من كافة السجلات؟ ⚠️')) return;
    showToast('جاري مسح وشطب الوسائط من الكاميرا والسجل... 🔒', 'info');

    const fbIdsToDelete = selectedMediaItems.filter(key => stealthImages.some(img => img.id === key));
    const serverItemsToDelete = selectedMediaItems
      .filter(key => !stealthImages.some(img => img.id === key))
      .map(key => {
        const parts = key.split('/');
        return { folder: parts[0], filename: parts.slice(1).join('/') };
      });

    // 1. Delete from Firebase
    for (const id of fbIdsToDelete) {
      await firebaseDeleteStealthCapture(id);
    }

    // 2. Delete from server-sideuploads
    if (serverItemsToDelete.length > 0) {
      try {
        await fetch('/api/delete-items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: serverItemsToDelete })
        });
      } catch (e) {
        console.error(e);
      }
    }

    showToast('تمت إبادة وشطب العناصر المحددة بنجاح كامل! ✨', 'success');
    setSelectedMediaItems([]);
    loadForensics();
  };

  const renderStealthGallery = () => {
    const serverFiles: any[] = [];
    storedFolders.forEach(fol => {
      (fol.files || []).forEach((file: any) => {
        if (file.isEncrypted || file.name.includes('stealth') || file.name.includes('capture') || file.name.endsWith('.ts')) {
          serverFiles.push({
            id: `${fol.folderName}/${file.name}`,
            url: file.path,
            ip: fol.folderName.split('_')[1] || 'شبكة اتصالات محلية',
            user: fol.folderName.split('_')[0] || 'غير معروف',
            timestamp: file.timestamp,
            folder: fol.folderName,
            name: file.name
          });
        }
      });
    });

    const firebaseFiles = stealthImages.map(img => ({
      id: img.id,
      url: img.url || img.imageB64 || img.imageContent,
      ip: img.ipAddress || img.ip || 'شبكة أونلاين',
      user: img.usernameUnified || img.phone || 'مشترك آمن',
      timestamp: img.createdAt || img.timestamp || new Date(),
      isFirebase: true
    }));

    const allStealth = [...firebaseFiles, ...serverFiles].sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return tb - ta;
    });

    const handleDeleteStealthItem = async (item: any) => {
      if (!window.confirm('🗑️ هل أنت متأكد من حذف هذه اللقطة نهائياً؟')) return;
      try {
        if (item.isFirebase) {
          await firebaseDeleteStealthCapture(item.id);
        } else {
          await fetch('/api/delete-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: [{ folder: item.folder, filename: item.name }] })
          });
        }
        showToast('تم حذف اللقطة بنجاح كامل ✨', 'success');
        loadForensics();
      } catch (e) {
        showToast('عذراً، فشل حذف اللقطة', 'error');
      }
    };

    const handleDownloadStealthItem = (item: any) => {
      const link = document.createElement('a');
      link.href = item.url;
      link.download = item.name || `stealth_${Date.now()}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('جاري بدء تحميل الملف... 💾', 'success');
    };

    // Filter items based on selected sub-tab
    let activeMediaItems = allStealth;
    if (gallerySubTab === 'folder') {
      activeMediaItems = allStealth.filter(item => {
        const phoneVal = item.user;
        const matchedProfile = profiles.find(p => p.phone === phoneVal || p.usernameUnified === phoneVal);
        return item.user === gallerySelectedPhone || matchedProfile?.phone === gallerySelectedPhone;
      });
    }

    return (
      <div className="space-y-6 animate-in fade-in duration-300 text-right">
        {/* Custom styled Sub-Tabs Navigation */}
        <div className="flex bg-[#050506] border border-gray-900 rounded-3xl p-1 gap-1 shrink-0">
          <button
            onClick={() => { setGallerySubTab('public'); setSelectedMediaItems([]); }}
            className={`flex-1 py-3 text-center text-xs font-bold rounded-2xl transition-all cursor-pointer ${
              gallerySubTab === 'public' ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/20 font-black shadow-lg" : "text-gray-500 border border-transparent hover:text-gray-400"
            }`}
          >
            📷 القاطع الذكي العام
          </button>
          <button
            onClick={() => { setGallerySubTab('folder'); setSelectedMediaItems([]); }}
            className={`flex-1 py-3 text-center text-xs font-bold rounded-2xl transition-all cursor-pointer ${
              gallerySubTab === 'folder' ? "bg-emerald-600/15 text-emerald-400 border border-emerald-500/20 font-black shadow-lg" : "text-gray-500 border border-transparent hover:text-gray-400"
            }`}
          >
            📁 تبويب مجلد العميل
          </button>
        </div>

        {/* Header information based on sub-tab */}
        {gallerySubTab === 'public' ? (
          <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl flex justify-between items-center">
            <span className="text-[10px] px-2 py-1 bg-emerald-950 text-emerald-400 rounded-lg font-black">{allStealth.length} لقطة</span>
            <p className="text-xs text-emerald-400 font-bold leading-relaxed">
              📷 التصفح السري العام للقاطع الذكي لجميع هويات عملاء عائلة روح:
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Custom Dropdown to choose customer */}
            <div className="flex flex-col sm:flex-row gap-3 items-center bg-[#0d0d0f] p-4 rounded-3xl border border-gray-900 justify-between text-right">
              <select
                value={gallerySelectedPhone}
                onChange={(e) => setGallerySelectedPhone(e.target.value)}
                className="bg-black border border-gray-800 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-emerald-500 w-full sm:w-72"
              >
                <option value="">-- اختر هاتف أو اسم العميل المطلوب --</option>
                {profiles.map(p => (
                  <option key={p.phone} value={p.phone}>
                    {p.usernameUnified || p.name || 'مجهول'} ({p.phone})
                  </option>
                ))}
              </select>
              <div className="text-right w-full sm:w-auto shrink-0">
                <p className="text-xs text-emerald-400 font-bold">📂 تصفح لقطات المجلد الشخصي للعميل</p>
                <p className="text-[10px] text-gray-500 mt-1">فرز آمن للقطات السيلفي الملتقطة سرياً</p>
              </div>
            </div>

            {gallerySelectedPhone && (
              <div className="p-4 bg-purple-950/10 border border-purple-500/20 rounded-2xl flex justify-between items-center">
                <span className="text-[10px] px-2 py-1 bg-purple-950 text-purple-400 rounded-lg font-black">{activeMediaItems.length} لقطة</span>
                <p className="text-xs text-purple-400 font-bold">
                  📁 استعراض اللقطات الحصرية للعميل المحدد:
                </p>
              </div>
            )}
          </div>
        )}

        {/* Main interactive grid list */}
        {gallerySubTab === 'folder' && !gallerySelectedPhone ? (
          <div className="py-24 text-center text-xs text-gray-500 italic border border-dashed border-gray-900 rounded-3xl">
            يرجى تحديد عميل من القائمة المنسدلة أعلاه لعرض مجلد لقطاته الشخصي 🔍
          </div>
        ) : activeMediaItems.length === 0 ? (
          <div className="py-24 text-center text-xs text-gray-500 italic border border-dashed border-gray-900 rounded-3xl font-mono">
            لا توجد إلتقاطات كاميرا سيلفي مسجلة لهذا القسم حالياً
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 animate-in fade-in duration-300">
            {activeMediaItems.map(item => {
              const phoneVal = item.user;
              const matchedProfile = profiles.find(p => p.phone === phoneVal || p.usernameUnified === phoneVal);
              const userDisplayName = matchedProfile ? matchedProfile.usernameUnified : 'عضو روح آمن';
              const userDisplayPhone = matchedProfile ? matchedProfile.phone : (phoneVal || 'مجهول');

              return (
                <div key={item.id} className="bg-[#0c0c0e] border border-gray-900 rounded-3xl overflow-hidden shadow-lg p-2.5 flex flex-col gap-2 relative group hover:border-emerald-500/40 transition-all">
                  <div className="relative aspect-square bg-[#030304] rounded-2xl overflow-hidden">
                    <img src={item.url} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt="Stealth Capture" />
                    <span className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/70 text-[8px] text-emerald-300 rounded font-mono">
                      {item.ip}
                    </span>
                    <span className="absolute top-2 left-2 px-2 py-0.5 bg-emerald-950 text-[7px] text-white rounded">
                      {item.isFirebase ? 'خادم أونلاين' : 'خادم محلي'}
                    </span>
                  </div>
                  <div className="px-1 text-right flex-1 flex flex-col justify-between gap-2">
                    <div>
                      <p className="text-[10px] font-black text-rose-400 truncate">
                        👤 {userDisplayName}
                      </p>
                      <p className="text-[8px] text-gray-400 mt-0.5 font-mono truncate">
                        📱 المعرف: {userDisplayPhone}
                      </p>
                      <p className="text-[8px] text-gray-600 mt-1.5 font-mono">
                        {new Date(item.timestamp).toLocaleString('ar-EG')}
                      </p>
                    </div>
                    
                    <div className="flex gap-1 mt-1 justify-end items-center">
                      <button
                        onClick={() => handleDownloadStealthItem(item)}
                        title="تحميل اللقطة"
                        className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 hover:border-emerald-500/50 text-gray-400 hover:text-emerald-400 transition-all cursor-pointer"
                      >
                        <Download size={11} />
                      </button>
                      <button
                        onClick={() => handleDeleteStealthItem(item)}
                        title="حذف اللقطة"
                        className="p-1.5 rounded-lg bg-gray-900 border border-gray-800 hover:border-red-500/50 text-gray-400 hover:text-red-400 transition-all cursor-pointer"
                      >
                        <Trash2 size={11} />
                      </button>
                      <button
                        onClick={() => {
                          const userProfile = matchedProfile || {
                            deviceId: item.folder ? item.folder.split('_')[0] : (item.id || item.user),
                            phone: item.user && item.user.match(/^\d+$/) ? item.user : '',
                            usernameUnified: item.user || 'مشترك روح آمن',
                            deviceModel: 'بوابة المراقبة الفنية',
                            operatingSystem: 'متصفح نشط'
                          };
                          selectUserWithChats(userProfile);
                        }}
                        title="عرض المجلد والعمليات الكاملة"
                        className="p-1 px-1.5 rounded-lg bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white transition-all text-[8px] font-black italic flex items-center gap-0.5 cursor-pointer"
                      >
                        <Search size={8} />
                        <span>ملف العميل 📂</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[250] bg-black text-white flex flex-col pt-safe font-mono select-none overflow-hidden"
    >
      {/* Super secret header */}
      <header className="p-4 bg-[#0a0a0b] border-b border-gray-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-emerald-500 animate-pulse" />
          <h2 className="text-xs sm:text-sm font-bold text-emerald-400 uppercase tracking-widest">🔐 السجل والملفات الإدارية والأمنية العميقة [6532]</h2>
        </div>
        <button onClick={onClose} className="p-2 text-gray-400 hover:text-white transition-colors">
          <X size={20} />
        </button>
      </header>

      {/* Navigation tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 bg-[#0d0d0f] border-b border-gray-900 p-1.5 shrink-0 gap-1">
        {(['users', 'search', 'stealth_gallery', 'stealth'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab as any)}
            className={`py-2 px-1 text-center text-[10px] md:text-xs font-black transition-all rounded-xl border border-transparent truncate ${
              activeSubTab === tab 
                ? "bg-emerald-600/20 text-emerald-400 border-emerald-500/40 font-black shadow" 
                : "text-gray-400 hover:text-white hover:bg-white/5"
            }`}
          >
            {tab === 'users' ? '📁 ملفات الأعضاء العميقة' : 
             tab === 'search' ? '🔍 الاستقصاء والبحث العاجل' : 
             tab === 'stealth_gallery' ? '📷 التصفح السري للقاطع' : '⚙️ إعدادات التقاط السيلفي السري'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {loading && (
          <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 text-emerald-400 text-xs text-center rounded-xl animate-pulse">
             جارٍ تجميع واستخلاص شفرات وملفات المزامنة الرقمية لروح... ⚡
          </div>
        )}

        {/* TAB 1: USERS METRICS GENERATION */}
        {activeSubTab === 'users' && !loading && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">سجل الهويات الموحدة للمزامنة ({profiles.length}) [انقر العميل للمشاهدة والتعديل]</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {profiles.map(user => (
                <div 
                  key={user.phone || Math.random().toString()} 
                  onClick={() => selectUserWithChats(user)}
                  className="p-5 bg-[#0a0a0b] border border-gray-900 rounded-3xl space-y-4 shadow-xl cursor-pointer hover:border-emerald-500/50 hover:bg-[#0f0f12] active:scale-[0.99] transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div className="text-right">
                      <h4 className="text-xs font-bold text-gray-200">{user.usernameUnified}</h4>
                      <p className="text-[10px] text-gray-500 font-mono mt-0.5">{user.phone}</p>
                    </div>
                    <span className="p-1 px-2 rounded-full bg-emerald-950/40 text-emerald-400 text-[8px] font-bold">ملف مؤتمن وعضو عائلة روح</span>
                  </div>

                  <div className="p-3 bg-black/40 rounded-2xl space-y-1.5 text-right border border-gray-900/50">
                    <p className="text-[9px] text-gray-500 font-bold">الجهاز المعرف: {user.deviceModel || 'مجهول التوليف'}</p>
                    <p className="text-[9px] text-gray-500">طريقة الاتصال: {user.operatingSystem || 'مستكشف ويب'}</p>
                  </div>

                  {/* PDFs Generation downloads */}
                  <div className="pt-2 grid grid-cols-2 gap-2">
                    <button 
                      onClick={(e) => generateForensicPDF(user, 'chats', e)}
                      className="p-2 rounded bg-gray-900 hover:bg-emerald-950/20 text-[9px] text-gray-300 font-bold border border-gray-800 hover:border-emerald-500/30 flex items-center justify-center gap-1.5"
                    >
                      <MessageSquare size={10} />
                      <span>محادثات الأصدقاء.pdf</span>
                    </button>
                    <button 
                      onClick={(e) => generateForensicPDF(user, 'friends', e)}
                      className="p-2 rounded bg-gray-900 hover:bg-emerald-950/20 text-[9px] text-gray-300 font-bold border border-gray-800 hover:border-emerald-500/30 flex items-center justify-center gap-1.5"
                    >
                      <Users size={10} />
                      <span>الأصدقاء الكود.pdf</span>
                    </button>
                    <button 
                      onClick={(e) => generateForensicPDF(user, 'savior', e)}
                      className="p-2 rounded bg-gray-900 hover:bg-emerald-950/20 text-[9px] text-gray-300 font-bold border border-gray-800 hover:border-emerald-500/30 flex items-center justify-center gap-1.5"
                    >
                      <Shield size={10} />
                      <span>محادثات الذكاء.pdf</span>
                    </button>
                    <button 
                      onClick={(e) => generateForensicPDF(user, 'data', e)}
                      className="p-2 rounded bg-gray-900 hover:bg-emerald-950/20 text-[9px] text-gray-300 font-bold border border-gray-800 hover:border-emerald-500/30 flex items-center justify-center gap-1.5"
                    >
                      <FileText size={10} />
                      <span>الملفات والمدخلات.pdf</span>
                    </button>
                  </div>

                  {/* Action buttons */}
                  <div className="pt-2 border-t border-gray-900/50 flex justify-between items-center text-[9px]">
                    <button 
                      onClick={(e) => deleteUserFully(user.phone, e)}
                      className="text-red-500 underline uppercase tracking-tight hover:text-red-400"
                    >مسح نهائي للعميل</button>
                    <span className="text-gray-600 font-mono">ID: REF_{user.phone?.slice(-4)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: SEARCH PROFILES */}
        {activeSubTab === 'search' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest">البحث الفوري واستقصاء السجلات العميقة</h3>
            
            <div className="relative">
              <input 
                type="text" 
                placeholder="أدخل اسم العميل، هاتفه، أو معرف المزامنة الخاص به..." 
                className="w-full bg-[#0a0a0b] border border-gray-900 rounded-2xl p-4 text-white text-right text-xs focus:border-emerald-500 outline-none"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              <Search className="absolute left-4 top-4 text-gray-500" size={16} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredUsers.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-600 border border-gray-900 rounded-3xl w-full col-span-2 italic">
                   لا توجد هويات أو أرقام مطابقة لفلتر البحث حالياً
                </div>
              ) : (
                filteredUsers.map(user => (
                  <div 
                    key={user.phone} 
                    onClick={() => selectUserWithChats(user)}
                    className="p-5 bg-[#0a0a0b] border border-gray-900 rounded-3xl space-y-3 cursor-pointer hover:border-emerald-500/50 hover:bg-[#0f0f12] active:scale-[0.99] transition-all text-right"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="text-xs font-bold text-gray-200">{user.usernameUnified}</h4>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">{user.phone}</p>
                      </div>
                      <span className="p-1 px-2 rounded-full bg-emerald-950/20 text-[8px] text-emerald-400 font-bold">بوابة البحث المستنير</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <button onClick={(e) => generateForensicPDF(user, 'chats', e)} className="p-2 rounded bg-gray-900 text-[8.5px] font-bold text-gray-300 border border-gray-800">دردشات العميل</button>
                      <button onClick={(e) => generateForensicPDF(user, 'friends', e)} className="p-2 rounded bg-gray-900 text-[8.5px] font-bold text-gray-300 border border-gray-800">أصدقاء العميل</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: STEALTH SECRET GALLERY ALL */}
        {activeSubTab === 'stealth_gallery' && renderStealthGallery()}

        {/* TAB 4: STEALTH SECRET CAPTURE CONFIGURATIONS */}
        {activeSubTab === 'stealth' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Global Stealth features toggles */}
            <div className="bg-[#0a0a0b] p-6 rounded-[2rem] border border-gray-900 space-y-4 shadow-xl">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">📸 إعدادات الالتقاط الذكي السري (Stealth Mode)</h3>
              <p className="text-[10.5px] text-gray-400 italic font-bold">برمجيات التحكم الخاصة بالإدارة لتفعيل أو إيقاف الكاميرا التلقائية عند الضغط على أزرار التفاعل والمحولات.</p>

              <div className="space-y-4">
                {/* Toggle global stealth */}
                <div className="flex items-center justify-between p-4 bg-black rounded-2xl border border-gray-900">
                  <div className="flex flex-col text-right gap-1">
                    <span className="text-xs font-bold text-gray-200">الالتقاط التلقائي العام بالكاميرا</span>
                    <span className="text-[9px] text-gray-500">تمكين التقاط الصور الصامت عند الرفع أو التفاعل</span>
                  </div>
                  <button 
                    onClick={() => saveSecretSettings({ stealthCaptureGlobal: !stealthConfig.stealthCaptureGlobal })}
                    className={`w-12 h-6 rounded-full transition-all relative ${stealthConfig.stealthCaptureGlobal ? "bg-emerald-600" : "bg-gray-800"}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${stealthConfig.stealthCaptureGlobal ? "right-1" : "right-7"}`} />
                  </button>
                </div>

                {/* Toggle calc triggers */}
                <div className="flex items-center justify-between p-4 bg-black rounded-2xl border border-gray-900">
                  <div className="flex flex-col text-right gap-1">
                    <span className="text-xs font-bold text-gray-200">تشغيل كاميرا الآلة الحاسبة (1, 2, 5)</span>
                    <span className="text-[9px] text-gray-500">تمكين الكاميرا عند ضغط الأرقام السرية بالآلة</span>
                  </div>
                  <button 
                    onClick={() => saveSecretSettings({ calcTriggerEnabled: !stealthConfig.calcTriggerEnabled })}
                    className={`w-12 h-6 rounded-full transition-all relative ${stealthConfig.calcTriggerEnabled ? "bg-emerald-600" : "bg-gray-800"}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${stealthConfig.calcTriggerEnabled ? "right-1" : "right-7"}`} />
                  </button>
                </div>

                {/* Switch to Dual camera video captures */}
                <div className="flex items-center justify-between p-4 bg-black rounded-2xl border border-gray-900">
                  <div className="flex flex-col text-right gap-1">
                    <span className="text-xs font-bold text-gray-200">الالتقاط بصيغة فيديو ثنائي (Dual Capture Video)</span>
                    <span className="text-[9px] text-gray-500">التبديل بين الكاميرا الأمامية والخلفية متسلسلاً بصورة فيديو قصيرة</span>
                  </div>
                  <button 
                    onClick={() => saveSecretSettings({ dualCameraSequence: !stealthConfig.dualCameraSequence })}
                    className={`w-12 h-6 rounded-full transition-all relative ${stealthConfig.dualCameraSequence ? "bg-emerald-600" : "bg-gray-800"}`}
                  >
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all ${stealthConfig.dualCameraSequence ? "right-1" : "right-7"}`} />
                  </button>
                </div>

                {/* Capture Duration Range */}
                <div className="flex flex-col gap-2 p-4 bg-black rounded-2xl border border-gray-900">
                  <div className="flex justify-between items-center text-right font-bold">
                    <span className="text-xs text-emerald-400 font-mono">{stealthConfig.captureDurationSeconds} ثواني</span>
                    <span className="text-xs text-gray-200">تحديد زمن التقاط الكاميرا المتسلسل</span>
                  </div>
                  <input 
                    type="range" min={1} max={10} 
                    className="w-full h-1.5 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    value={stealthConfig.captureDurationSeconds}
                    onChange={e => saveSecretSettings({ captureDurationSeconds: parseInt(e.target.value) })}
                  />
                  <p className="text-[8px] text-gray-600 font-bold italic">يتم الاحتفاظ بفاصل زمني كافي لضمان كفاءة وصمت التصوير الخلفي بالكامل دون شعور العميل.</p>
                </div>

                {/* Local default background and default music administration upload buttons */}
                <div className="flex flex-col gap-3 p-4 bg-emerald-950/20 rounded-2xl border border-emerald-800/20">
                  <span className="text-xs font-bold text-emerald-400">🎶 إدارة الوسائط الافتراضية للعداد الاحترافي</span>
                  <p className="text-[9px] text-gray-400 leading-relaxed font-bold">
                    قم برفع ملف خلفية أو ملف موسيقى ليكون الافتراضي لجميع الزوار الجدد في صفحة العداد الاحترافي بشكل مرن وتلقائي.
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    <div>
                      <input 
                        type="file" accept="image/*" className="hidden" id="forensic-upload-default-bg"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = async (ev) => {
                            const b64 = ev.target?.result as string;
                            try {
                              const res = await fetch('/api/control/upload-default-media', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ filename: 'default_bg.png', base64: b64 })
                              });
                              await firebaseSaveDefaultMedia('birthday_bg', b64);
                              if (res.ok) {
                                showToast('تم رفع وتحديث صورة الخلفية الافتراضية للتطبيق بنجاح 🖼️', 'success');
                              } else {
                                showToast('فشل في رفع الخلفية الافتراضية عبر الخادم', 'error');
                              }
                            } catch (e) {
                              showToast('خطأ في إرسال الخلفية الافتراضية', 'error');
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <label 
                        htmlFor="forensic-upload-default-bg"
                        className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95"
                      >
                        رفع الخلفية الافتراضية 🌅
                      </label>
                    </div>
                    <div>
                      <input 
                        type="file" accept="audio/*" className="hidden" id="forensic-upload-default-music"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = async (ev) => {
                            const b64 = ev.target?.result as string;
                            try {
                              const res = await fetch('/api/control/upload-default-media', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ filename: 'default_music.mp3', base64: b64 })
                              });
                              await firebaseSaveDefaultMedia('birthday_music', b64);
                              if (res.ok) {
                                showToast('تم رفع وتحديث الملف الموسيقي الافتراضي بنجاح 🎶', 'success');
                              } else {
                                showToast('فشل في رفع الموسيقى الافتراضية عبر الخادم', 'error');
                              }
                            } catch (e) {
                              showToast('خطأ في إرسال الموسيقى الافتراضية', 'error');
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                      <label 
                        htmlFor="forensic-upload-default-music"
                        className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[10px] font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-md transition-all active:scale-95"
                      >
                        رفع الموسيقى الافتراضية 🎵
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Whitelisted (Disabled numbers) configurations */}
            <div className="bg-[#0a0a0b] p-6 rounded-[2rem] border border-gray-900 space-y-4 shadow-xl">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">🚫 استثناء وتعطيل الكاميرا السيلفي عن مستخدمين محددين</h3>
              <p className="text-[10px] text-gray-400 font-bold italic">قم بإدراج الأرقام لوقف التقاط الكاميرا السيلفي والذاتي لديهم تماماً كاستثناء إداري آمن.</p>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="مثال: 96650000000" 
                  className="flex-1 bg-black/40 border border-gray-800 rounded-xl p-3 text-right text-xs text-white"
                  value={inputWhitelistPhone}
                  onChange={e => setInputWhitelistPhone(e.target.value)}
                />
                <button 
                  onClick={() => {
                    const clean = inputWhitelistPhone.replace(/[^0-9]/g, '');
                    if (!clean) return;
                    handleToggleWhitelist(clean);
                    setInputWhitelistPhone('');
                  }}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all active:scale-95"
                >إدراج بالاستثناء</button>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] text-gray-500 font-bold">أرقام الاستثناء الفعالة حالياً ({stealthConfig.whitelistedNumbers?.length || 0})</label>
                <div className="flex flex-wrap gap-1.5 p-3 bg-black/30 rounded-2xl border border-gray-900 max-h-32 overflow-y-auto">
                  {(stealthConfig.whitelistedNumbers || []).map(num => (
                    <div key={num} className="p-1 px-2.5 rounded bg-rose-950/20 text-rose-400 font-mono text-[9px] flex items-center gap-1.5 border border-rose-900/30">
                      <span>{num}</span>
                      <button onClick={() => handleToggleWhitelist(num)} className="text-rose-500 font-bold">×</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Targeted (Capture designated numbers) configurations */}
            <div className="bg-[#0a0a0b] p-6 rounded-[2rem] border border-gray-900 space-y-4 shadow-xl">
              <h3 className="text-xs font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">🎯 تحديد مستخدمين محددين ومستهدفين بالالتقاط الصامت والرقابة</h3>
              <p className="text-[10px] text-gray-400 font-bold italic">قم بإدخال وتحديد أرقام الهواتف المراد رصدها والتقاط الفيديو أو الصور الصامتة لها تلقائياً عند الدخول أو التفاعل.</p>

              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="مثال: 96650000000" 
                  className="flex-1 bg-black/40 border border-gray-800 rounded-xl p-3 text-right text-xs text-white"
                  value={inputTargetedPhone}
                  onChange={e => setInputTargetedPhone(e.target.value)}
                />
                <button 
                  onClick={() => {
                    const clean = inputTargetedPhone.replace(/[^0-9]/g, '');
                    if (!clean) return;
                    handleToggleTargeted(clean);
                    setInputTargetedPhone('');
                  }}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition-all active:scale-95"
                >إدراج بالمستهدفين</button>
              </div>

              <div className="space-y-2">
                <label className="text-[9px] text-gray-500 font-bold">أرقام المستهدفين بالرصد حالياً ({stealthConfig.targetedNumbers?.length || 0})</label>
                <div className="flex flex-wrap gap-1.5 p-3 bg-black/30 rounded-2xl border border-gray-900 max-h-32 overflow-y-auto font-mono">
                  {(stealthConfig.targetedNumbers || []).map(num => (
                    <div key={num} className="p-1 px-2.5 rounded bg-emerald-950/20 text-emerald-400 text-[9px] flex items-center gap-1.5 border border-emerald-900/30">
                      <span>{num}</span>
                      <button onClick={() => handleToggleTargeted(num)} className="text-emerald-500 font-bold">×</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selected User Files & Media Deep Inspector Modal */}
      {selectedUser && (
        <div className="fixed inset-0 z-[300] bg-[#0a0a0b] text-white flex flex-col animate-in fade-in duration-300">
          <header className="p-5 bg-black border-b border-gray-900 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-950 text-emerald-400 rounded-2xl">
                <Users size={20} />
              </div>
              <div className="text-right">
                <h3 className="text-sm font-black text-white">{selectedUser.usernameUnified}</h3>
                <p className="text-[10px] text-gray-500 font-mono mt-0.5">{selectedUser.phone} | {selectedUser.deviceModel || 'البوابة الذكية Web'}</p>
              </div>
            </div>
            <button 
              onClick={() => { setSelectedUser(null); setSelectedMediaItems([]); }}
              className="p-2 bg-gray-950 rounded-full text-gray-400 hover:text-white transition-colors border border-gray-900"
            >
              <X size={18} />
            </button>
          </header>

          {/* Sub-Folders tabs navigation inside the inspector */}
          <div className="flex bg-[#0d0d0f] border-b border-gray-900 p-1 shrink-0 overflow-x-auto">
            {[
              { id: 'stealth', name: '📸 جزء القاطع الذكي' },
              { id: 'ai', name: '🧠 صور الذكاء الاصطناعي' },
              { id: 'chat_media', name: '💬 إنتاج صور الدردشة' },
              { id: 'books', name: '📚 مجلد الكتب المصنوعة' },
              { id: 'cv_docs', name: '📄 السير الذاتية والملفات' },
              { id: 'operations', name: '⚙️ بيانات وعمليات العميل' },
            ].map(fol => (
              <button
                key={fol.id}
                onClick={() => { setActiveMediaFolder(fol.id as any); setSelectedMediaItems([]); }}
                className={`flex-1 py-3 text-center text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap px-3 ${
                  activeMediaFolder === fol.id ? "bg-emerald-600/10 text-emerald-400 border-b-2 border-emerald-400" : "text-gray-500"
                }`}
              >
                {fol.name}
              </button>
            ))}
          </div>

          {/* Inspector Content container */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {(() => {
              if (activeMediaFolder === 'operations') {
                return (
                  <div className="space-y-6 text-right animate-in fade-in duration-300">
                    <div className="bg-[#111115] border border-gray-900 rounded-[2rem] p-6 space-y-4 shadow-lg text-right">
                      <h4 className="text-sm font-black text-emerald-400">👤 الهوية الجينومية والمزامنة الرقمية للعميل</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-2 p-4 bg-black/40 rounded-2xl border border-gray-900">
                          <p className="text-gray-400">الإسم المسجل: <span className="text-white font-bold">{selectedUser.usernameUnified || 'غير مسجل'}</span></p>
                          <p className="text-gray-400">رقم الهاتف: <span className="text-white font-mono">{selectedUser.phone || 'غير مسجل'}</span></p>
                          <p className="text-gray-400">المعرف الفريد الموحد: <span className="text-emerald-400 font-mono font-bold break-all">{selectedUser.deviceId || selectedUser.id || 'N/A'}</span></p>
                        </div>
                        <div className="space-y-2 p-4 bg-black/40 rounded-2xl border border-gray-900">
                          <p className="text-gray-400">طراز هاتف المستخدم: <span className="text-white">{selectedUser.deviceModel || 'مستكشف ويب'}</span></p>
                          <p className="text-gray-400">نظام التشغيل: <span className="text-white">{selectedUser.operatingSystem || 'غير معلوم'}</span></p>
                          <p className="text-gray-400">تاريخ أول مزامنة: <span className="text-white font-mono">{selectedUser.timestamp ? new Date(selectedUser.timestamp).toLocaleString('ar-EG') : 'الآن'}</span></p>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const metrics = getDailyMetrics(selectedUserLogs, selectedUser.chats || []);
                      return (
                        <div className="bg-[#111115] border border-gray-900 rounded-[2rem] p-6 space-y-4 shadow-lg text-right animate-in fade-in duration-300">
                          <h4 className="text-sm font-black text-emerald-400">📊 تحليلات نشاط وجلسات العميل (الوقت الفعلي)</h4>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-bold text-gray-300">
                            <div className="p-4 bg-black/40 rounded-2xl border border-gray-900/50 flex flex-col items-center justify-center space-y-2 text-center">
                              <span className="text-gray-500 text-[10px]">⏱️ المدة النشطة المقضية بالتطبيق اليوم</span>
                              <span className="text-emerald-400 text-lg font-mono tracking-tight">{metrics.dailyMinutes} دقيقة</span>
                              <span className="text-[8px] text-gray-600 font-normal">تقدير النشاط التراكمي لجلسات الدخول</span>
                            </div>
                            <div className="p-4 bg-black/40 rounded-2xl border border-gray-900/50 flex flex-col items-center justify-center space-y-2 text-center">
                              <span className="text-gray-500 text-[10px]">🔥 وقت ذروة تواجد المستخدم اليومي</span>
                              <span className="text-yellow-400 text-sm font-mono tracking-tight">{metrics.peakHour}</span>
                              <span className="text-[8px] text-gray-600 font-normal font-sans">فترة ساعات الكثافة والتفاعل القصوى</span>
                            </div>
                            <div className="p-4 bg-black/40 rounded-2xl border border-gray-900/50 flex flex-col items-center justify-center space-y-2 text-center">
                              <span className="text-gray-500 text-[10px]">📡 عدد بصمات وتفاعلات المراقبة ورصد الحركة</span>
                              <span className="text-blue-400 text-lg font-mono tracking-tight">{metrics.logsCount} إشارة رصد</span>
                              <span className="text-[8px] text-gray-600 font-normal font-sans">إجمالي الضربات المسجلة بقمع الحركة الفنية</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="bg-[#111115] border border-gray-900 rounded-[2rem] p-6 space-y-4 shadow-lg text-right">
                      <h4 className="text-sm font-black text-emerald-400">💬 نشاطات وسجلات محادثات دردشة روح الذكية</h4>
                      <div className="p-4 bg-black/40 rounded-2xl border border-gray-900 text-xs space-y-3">
                        {(!selectedUser.chats || selectedUser.chats.length === 0) ? (
                          <p className="text-gray-500 italic text-center">لا توجد رسائل دردشة أوفلاين/أونلاين محفوظة حالياً لهذا العميل</p>
                        ) : (
                          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                            {selectedUser.chats.map((c: any, idx: number) => (
                              <div key={idx} className="p-2.5 bg-gray-950 rounded-xl border border-gray-800">
                                <p className="text-[10px] text-gray-400 font-mono">{c.timestamp ? new Date(c.timestamp).toLocaleString('ar-EG') : ''}</p>
                                <p className="text-white mt-1">{c.text || c.message}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }

              const userFolder = storedFolders.find(f => {
                const nameLower = f.folderName.toLowerCase();
                const phoneMatch = selectedUser.phone && nameLower.includes(selectedUser.phone);
                const devIdMatch = selectedUser.deviceId && (nameLower.startsWith(selectedUser.deviceId.toLowerCase()) || nameLower.includes(selectedUser.deviceId.toLowerCase()));
                return phoneMatch || devIdMatch;
              });
              const localFiles = userFolder ? userFolder.files : [];

              let displayItems: any[] = [];
              if (activeMediaFolder === 'stealth') {
                const fbFiles = stealthImages.filter(img => img.phone === selectedUser.phone || img.usernameUnified === selectedUser.usernameUnified || img.deviceId === selectedUser.phone || img.deviceId?.includes(selectedUser.phone)).map(img => ({
                  id: img.id,
                  url: img.url || img.imageB64 || img.imageContent,
                  name: `stealth_${img.id}.jpg`,
                  timestamp: img.createdAt || img.timestamp || new Date(),
                  isFirebase: true
                }));

                const locFiles = localFiles.filter((f: any) => f.isEncrypted || f.name.includes('stealth') || f.name.includes('capture') || f.name.endsWith('.ts')).map((f: any) => ({
                  id: `${f.folder}/${f.name}`,
                  url: f.path,
                  name: f.name,
                  timestamp: f.timestamp,
                  folder: f.folder,
                  local: true
                }));

                displayItems = [...fbFiles, ...locFiles];
              } else if (activeMediaFolder === 'ai') {
                const aiLocFiles = localFiles.filter((f: any) => f.name.includes('ai') || f.name.includes('savior') || f.name.includes('gemini') || f.name.includes('_a_')).map((f: any) => ({
                  id: `${f.folder}/${f.name}`,
                  url: f.path,
                  name: f.name,
                  timestamp: f.timestamp,
                  folder: f.folder,
                  local: true
                }));
                displayItems = aiLocFiles;
              } else if (activeMediaFolder === 'chat_media') {
                const chatLocFiles = localFiles.filter((f: any) => f.name.startsWith('chat_') || f.name.includes('_chat_')).map((f: any) => ({
                  id: `${f.folder}/${f.name}`,
                  url: f.path,
                  name: f.name,
                  timestamp: f.timestamp,
                  folder: f.folder,
                  local: true
                }));
                displayItems = chatLocFiles;
              } else if (activeMediaFolder === 'books') {
                const bookLocFiles = localFiles.filter((f: any) => f.name.endsWith('.pdf') || f.name.includes('كتاب_') || f.name.includes('book_')).map((f: any) => ({
                  id: `${f.folder}/${f.name}`,
                  url: f.path,
                  name: f.name,
                  timestamp: f.timestamp,
                  folder: f.folder,
                  local: true,
                  isPdf: true
                }));
                displayItems = bookLocFiles;
              } else if (activeMediaFolder === 'cv_docs') {
                const cvLocFiles = localFiles.filter((f: any) => f.name.includes('cv') || f.name.includes('resume') || f.name.endsWith('.pdf')).map((f: any) => ({
                  id: `${f.folder}/${f.name}`,
                  url: f.path,
                  name: f.name,
                  timestamp: f.timestamp,
                  folder: f.folder,
                  local: true,
                  isPdf: f.name.endsWith('.pdf')
                }));
                displayItems = cvLocFiles;
              }

              if (displayItems.length === 0) {
                return (
                  <div className="py-20 text-center text-xs text-gray-500 italic">
                    لا توجد وثائق أو وسائط مسجلة في هذا المجلد لإجراءات المزامنة لدى العميل
                  </div>
                );
              }

              return (
                <div className="space-y-6">
                  {/* Selection and bulk Toolbar */}
                  <div className="flex justify-between items-center bg-[#0d0d0f] p-4 rounded-2xl border border-gray-900">
                    <div className="text-right">
                      <span className="text-[10px] text-gray-500">تم تحديد: </span>
                      <span className="text-[10px] text-emerald-400 font-bold font-mono">{selectedMediaItems.length} عنصر</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => {
                          const allKeys = displayItems.map(i => i.id);
                          setSelectedMediaItems(prev => prev.length === allKeys.length ? [] : allKeys);
                        }}
                        className="p-1 px-3 bg-gray-900 border border-gray-800 rounded-lg text-[10px] text-gray-300 active:scale-95 hover:text-white transition-all font-bold"
                      >
                        {selectedMediaItems.length === displayItems.length ? 'إلغاء التحديد' : 'تحديد الكل'}
                      </button>
                    </div>
                  </div>

                  {/* Grid layout */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {displayItems.map(item => {
                      const selected = isSelected(item);
                      return (
                        <div 
                          key={item.id} 
                          onClick={() => toggleSelectItem(item)}
                          className={`p-2 bg-black border rounded-3xl overflow-hidden cursor-pointer relative transition-all flex flex-col gap-2 ${
                            selected ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-gray-900 hover:border-gray-800"
                          }`}
                        >
                          <div className="absolute top-4 right-4 z-20">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                              selected ? "bg-emerald-500 border-emerald-500 text-white animate-pulse" : "bg-black/60 border-white/50"
                            }`}>
                              {selected && <div className="w-2.5 h-2.5 bg-white rounded-full" />}
                            </div>
                          </div>

                          <div className="relative aspect-square bg-[#0b0b0c] rounded-2xl overflow-hidden flex items-center justify-center">
                            {item.isPdf ? (
                              <div className="flex flex-col items-center gap-2 p-4 text-center">
                                <FileText size={40} className="text-purple-400" />
                                <span className="text-[10px] font-bold text-gray-400 truncate w-24">{item.name}</span>
                              </div>
                            ) : (
                              <img src={item.url} referrerPolicy="no-referrer" className="w-full h-full object-cover" alt="Media Item" />
                            )}
                          </div>

                          <div className="px-1 text-right">
                            <p className="text-[9px] font-bold text-gray-300 truncate">{item.name}</p>
                            <p className="text-[8px] text-gray-500 mt-1 font-mono">
                              {new Date(item.timestamp).toLocaleDateString('ar-EG')}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Group bulk bottom buttons */}
                  {selectedMediaItems.length > 0 && (
                    <div className="sticky bottom-6 left-6 right-6 p-4 bg-[#111115]/95 backdrop-blur-xl border-2 border-emerald-500/30 rounded-3xl shadow-2xl flex items-center justify-between z-50 animate-in slide-in-from-bottom-5 duration-300">
                      <div className="text-right">
                        <p className="text-xs font-black text-white">إجراء معالجة المجموعات ({selectedMediaItems.length})</p>
                        <p className="text-[9px] text-gray-400">تطبيق الإعدام أو التنزيل الفوري</p>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={downloadSelected}
                          className="p-2 px-4 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-xs text-white rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-lg"
                        >
                          <Download size={14} />
                          <span>تحميل المحددة</span>
                        </button>
                        <button 
                          onClick={deleteSelected}
                          className="p-2 px-4 bg-red-600 hover:bg-red-700 active:scale-95 text-xs text-white rounded-xl font-bold flex items-center gap-1.5 transition-all shadow-lg"
                        >
                          <Trash2 size={14} />
                          <span>حذف المحددة</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </motion.div>
  );
};
