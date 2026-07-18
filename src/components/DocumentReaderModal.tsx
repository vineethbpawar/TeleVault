import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  StyleSheet,
  Platform,
  Dimensions,
} from 'react-native';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, FileText, Download } from 'lucide-react-native';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ─── Types ───────────────────────────────────────────────────────────────────

interface DocumentReaderProps {
  visible: boolean;
  onClose: () => void;
  fileUrl: string;          // Resolved URL or blob URL of the file
  fileName: string;
  mimeType?: string | null;
  onExport?: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function detectDocType(fileName: string, mimeType?: string | null): 'pdf' | 'docx' | 'text' | 'markdown' | 'unknown' {
  const name = fileName.toLowerCase();
  const mime = (mimeType || '').toLowerCase();

  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    name.endsWith('.docx')
  ) return 'docx';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'markdown';
  if (
    mime.startsWith('text/') ||
    /\.(txt|log|json|csv|js|ts|html|css|xml|yaml|yml|sh|py|kt|swift|go|rs|c|cpp|h|java)$/.test(name)
  ) return 'text';

  return 'unknown';
}

// Dynamically load a script from CDN (Web only)
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).__loadedScripts?.[src]) { resolve(); return; }
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      if (!(window as any).__loadedScripts) (window as any).__loadedScripts = {};
      (window as any).__loadedScripts[src] = true;
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ─── PDF Renderer (Web only) ─────────────────────────────────────────────────

const PdfReader: React.FC<{ fileUrl: string }> = ({ fileUrl }) => {
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageRendering, setPageRendering] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<any>(null);

  const renderPage = useCallback(async (pageNum: number, sc: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    setPageRendering(true);
    try {
      const page = await pdfDocRef.current.getPage(pageNum);
      const viewport = page.getViewport({ scale: sc });
      const canvas = canvasRef.current;
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      const ctx = canvas.getContext('2d')!;
      await page.render({ canvasContext: ctx, viewport }).promise;
    } catch (e: any) {
      setError(e.message || 'Failed to render page');
    } finally {
      setPageRendering(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Load PDF.js from CDN
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
        const pdfjsLib = (window as any).pdfjsLib;
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const loadingTask = pdfjsLib.getDocument(fileUrl);
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setNumPages(pdf.numPages);
        setLoading(false);
        await renderPage(1, scale);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load PDF');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => {
    renderPage(currentPage, scale);
  }, [currentPage, scale]);

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#FFFC00" />
      <Text style={styles.loadingText}>Loading PDF…</Text>
    </View>
  );

  if (error) return (
    <View style={styles.centered}>
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );

  return (
    <View style={styles.pdfContainer}>
      {/* Toolbar */}
      <View style={styles.pdfToolbar}>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setScale(s => Math.max(0.5, s - 0.2))}>
          <ZoomOut size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.toolbarText}>{Math.round(scale * 100)}%</Text>
        <TouchableOpacity style={styles.toolbarBtn} onPress={() => setScale(s => Math.min(3, s + 0.2))}>
          <ZoomIn size={18} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          style={[styles.toolbarBtn, currentPage <= 1 && styles.toolbarBtnDisabled]}
          onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
        >
          <ChevronLeft size={18} color={currentPage <= 1 ? '#555' : '#FFFFFF'} />
        </TouchableOpacity>
        <Text style={styles.toolbarText}>{currentPage} / {numPages}</Text>
        <TouchableOpacity
          style={[styles.toolbarBtn, currentPage >= numPages && styles.toolbarBtnDisabled]}
          onPress={() => setCurrentPage(p => Math.min(numPages, p + 1))}
          disabled={currentPage >= numPages}
        >
          <ChevronRight size={18} color={currentPage >= numPages ? '#555' : '#FFFFFF'} />
        </TouchableOpacity>
      </View>

      {/* Canvas */}
      <ScrollView
        style={styles.pdfScrollArea}
        contentContainerStyle={styles.pdfScrollContent}
        maximumZoomScale={3}
        minimumZoomScale={0.5}
      >
        {pageRendering && (
          <View style={styles.pageRenderingOverlay}>
            <ActivityIndicator size="small" color="#FFFC00" />
          </View>
        )}
        {/* Use a web-only canvas element via dangerouslySetInnerHTML approach */}
        <View>
          {/* @ts-ignore */}
          <canvas ref={canvasRef} style={{ display: 'block', maxWidth: '100%' }} />
        </View>
      </ScrollView>
    </View>
  );
};

// ─── DOCX Renderer (Web only) ─────────────────────────────────────────────────

const DocxReader: React.FC<{ fileUrl: string }> = ({ fileUrl }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);

        // Load mammoth.js from CDN
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js');
        const mammoth = (window as any).mammoth;

        const res = await fetch(fileUrl);
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;

        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (cancelled) return;

        setHtml(result.value);
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load document');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl]);

  useEffect(() => {
    if (html && containerRef.current) {
      containerRef.current.innerHTML = html;
    }
  }, [html]);

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#FFFC00" />
      <Text style={styles.loadingText}>Loading document…</Text>
    </View>
  );

  if (error) return (
    <View style={styles.centered}>
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );

  return (
    <ScrollView style={styles.docxScrollArea} contentContainerStyle={{ padding: 20 }}>
      {/* @ts-ignore */}
      <div
        ref={containerRef}
        style={{
          color: '#E5E5EA',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontSize: 15,
          lineHeight: 1.7,
        }}
      />
    </ScrollView>
  );
};

// ─── Text / Markdown Renderer ────────────────────────────────────────────────

const TextReader: React.FC<{ fileUrl: string; isMarkdown: boolean }> = ({ fileUrl, isMarkdown }) => {
  const [content, setContent] = useState<string | null>(null);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(fileUrl);
        const text = await res.text();
        if (cancelled) return;

        if (isMarkdown && Platform.OS === 'web') {
          await loadScript('https://cdn.jsdelivr.net/npm/marked/marked.min.js');
          const marked = (window as any).marked;
          const html = marked.parse(text);
          setRenderedHtml(html);
        } else {
          setContent(text);
        }
        setLoading(false);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load file');
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fileUrl, isMarkdown]);

  useEffect(() => {
    if (renderedHtml && containerRef.current) {
      containerRef.current.innerHTML = renderedHtml;
    }
  }, [renderedHtml]);

  if (loading) return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#FFFC00" />
      <Text style={styles.loadingText}>Loading…</Text>
    </View>
  );

  if (error) return (
    <View style={styles.centered}>
      <Text style={styles.errorText}>{error}</Text>
    </View>
  );

  if (renderedHtml !== null && Platform.OS === 'web') {
    return (
      <ScrollView style={styles.docxScrollArea} contentContainerStyle={{ padding: 24 }}>
        {/* @ts-ignore */}
        <div
          ref={containerRef}
          style={{
            color: '#E5E5EA',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: 15,
            lineHeight: 1.75,
          }}
        />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.textScrollArea} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.textContent}>{content}</Text>
    </ScrollView>
  );
};

// ─── Native Document Reader (Android/iOS) ─────────────────────────────────────

const getPdfTemplate = (base64: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    body { margin: 0; padding: 0; background-color: #0A0A0F; color: #FFFFFF; font-family: -apple-system, sans-serif; }
    #canvas-container { display: flex; flex-direction: column; align-items: center; padding: 12px; gap: 16px; }
    canvas { max-width: 100%; box-shadow: 0 4px 12px rgba(0,0,0,0.6); background: white; border-radius: 4px; }
    .loading { text-align: center; padding: 40px; font-size: 16px; color: #FFFC00; font-weight: 600; }
  </style>
</head>
<body>
  <div id="loading" class="loading">Generating preview...</div>
  <div id="canvas-container"></div>
  <script>
    try {
      const pdfjsLib = window['pdfjs-dist/build/pdf'];
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      
      const base64Data = \`${base64}\`;
      const binaryData = atob(base64Data);
      const len = binaryData.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryData.charCodeAt(i);
      }
      
      pdfjsLib.getDocument({ data: bytes }).promise.then(function(pdf) {
          document.getElementById('loading').style.display = 'none';
          const container = document.getElementById('canvas-container');
          
          let pageIndex = 1;
          function renderNextPage() {
              if (pageIndex > pdf.numPages) return;
              
              const canvas = document.createElement('canvas');
              container.appendChild(canvas);
              
              pdf.getPage(pageIndex).then(function(page) {
                  const viewport = page.getViewport({ scale: 1.5 });
                  canvas.height = viewport.height;
                  canvas.width = viewport.width;
                  const context = canvas.getContext('2d');
                  
                  page.render({ canvasContext: context, viewport: viewport }).promise.then(function() {
                      pageIndex++;
                      renderNextPage();
                  });
              });
          }
          renderNextPage();
      }).catch(function(error) {
          document.getElementById('loading').innerText = 'Error: ' + error.message;
      });
    } catch (err) {
      document.getElementById('loading').innerText = 'Failed: ' + err.message;
    }
  </script>
</body>
</html>
`;

const getDocxTemplate = (base64: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>
  <style>
    body { 
      margin: 0; 
      padding: 20px; 
      background-color: #0A0A0F; 
      color: #E5E5EA; 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 15px;
      line-height: 1.6;
    }
    .loading { text-align: center; padding: 40px; font-size: 16px; color: #FFFC00; font-weight: 600; }
    p { margin-bottom: 16px; }
    h1, h2, h3, h4 { color: #FFFFFF; margin-top: 24px; margin-bottom: 12px; }
    a { color: #FFFC00; }
  </style>
</head>
<body>
  <div id="loading" class="loading">Reading Document...</div>
  <div id="content"></div>
  <script>
    try {
      const base64Data = \`${base64}\`;
      const binaryData = atob(base64Data);
      const len = binaryData.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
          bytes[i] = binaryData.charCodeAt(i);
      }
      
      window.mammoth.convertToHtml({ arrayBuffer: bytes.buffer })
        .then(function(result) {
          document.getElementById('loading').style.display = 'none';
          document.getElementById('content').innerHTML = result.value;
        })
        .catch(function(err) {
          document.getElementById('loading').innerText = 'Conversion Error: ' + err.message;
        });
    } catch (err) {
      document.getElementById('loading').innerText = 'Failed: ' + err.message;
    }
  </script>
</body>
</html>
`;

const getMarkdownTemplate = (base64Markdown: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body { 
      margin: 0; 
      padding: 20px; 
      background-color: #0A0A0F; 
      color: #E5E5EA; 
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 15px;
      line-height: 1.6;
    }
    .loading { text-align: center; padding: 40px; font-size: 16px; color: #FFFC00; }
    pre { background: #12121C; padding: 12px; border-radius: 8px; overflow-x: auto; }
    code { font-family: monospace; font-size: 13px; color: #FFFC00; }
    h1, h2, h3, h4 { color: #FFFFFF; margin-top: 24px; margin-bottom: 12px; }
    a { color: #FFFC00; }
  </style>
</head>
<body>
  <div id="loading" class="loading">Loading...</div>
  <div id="content"></div>
  <script>
    try {
      const base64Data = \`${base64Markdown}\`;
      const utf8Text = decodeURIComponent(escape(atob(base64Data)));
      document.getElementById('loading').style.display = 'none';
      document.getElementById('content').innerHTML = window.marked.parse(utf8Text);
    } catch (err) {
      document.getElementById('loading').innerText = 'Error: ' + err.message;
    }
  </script>
</body>
</html>
`;

const getTextTemplate = (base64Text: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=3.0, user-scalable=yes">
  <style>
    body { 
      margin: 0; 
      padding: 20px; 
      background-color: #0A0A0F; 
      color: #E5E5EA; 
      font-family: monospace;
      font-size: 13px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-break: break-all;
    }
  </style>
</head>
<body><script>
    try {
      const base64Data = \`${base64Text}\`;
      const utf8Text = decodeURIComponent(escape(atob(base64Data)));
      document.body.innerText = utf8Text;
    } catch (err) {
      document.body.innerText = 'Error: ' + err.message;
    }
</script></body>
</html>
`;

const NativeDocReader: React.FC<{ fileUrl: string; docType: 'pdf' | 'docx' | 'markdown' | 'text' | 'unknown' }> = ({ fileUrl, docType }) => {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadFile = async () => {
      try {
        setLoading(true);
        setError(null);

        const FileSystem = require('expo-file-system/legacy');

        let template = '';
        if (docType === 'pdf' || docType === 'docx') {
          const base64Data = await FileSystem.readAsStringAsync(fileUrl, {
            encoding: FileSystem.EncodingType.Base64,
          });
          if (!active) return;
          template = docType === 'pdf' ? getPdfTemplate(base64Data) : getDocxTemplate(base64Data);
        } else {
          const textContent = await FileSystem.readAsStringAsync(fileUrl, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          if (!active) return;
          const base64Text = btoa(unescape(encodeURIComponent(textContent)));
          template = docType === 'markdown' ? getMarkdownTemplate(base64Text) : getTextTemplate(base64Text);
        }

        setHtml(template);
        setLoading(false);
      } catch (err: any) {
        console.error('NativeDocReader load error:', err);
        if (active) {
          setError(err.message || 'Failed to load file content.');
          setLoading(false);
        }
      }
    };

    loadFile();
    return () => {
      active = false;
    };
  }, [fileUrl, docType]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#FFFC00" />
        <Text style={styles.loadingText}>Reading Document…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  const { WebView } = require('react-native-webview');
  return (
    <WebView
      originWhitelist={['*']}
      source={{ html: html || '' }}
      style={{ flex: 1, backgroundColor: '#0A0A0F' }}
      javaScriptEnabled={true}
      domStorageEnabled={true}
      scalesPageToFit={true}
    />
  );
};

// ─── Main DocumentReaderModal ────────────────────────────────────────────────

export const DocumentReaderModal: React.FC<DocumentReaderProps> = ({
  visible,
  onClose,
  fileUrl,
  fileName,
  mimeType,
  onExport,
}) => {
  const docType = detectDocType(fileName, mimeType);
  const shortName = fileName.length > 40 ? fileName.substring(0, 38) + '…' : fileName;

  const renderReader = () => {
    if (!fileUrl) return null;

    if (Platform.OS !== 'web') {
      if (docType === 'unknown') {
        return (
          <View style={styles.centered}>
            <FileText size={64} color="#8E8E93" style={{ marginBottom: 16 }} />
            <Text style={styles.unsupportedTitle}>{shortName}</Text>
            <Text style={styles.unsupportedSub}>Preview not available for this file type.</Text>
            <Text style={styles.unsupportedSub}>Use "Export" to open externally.</Text>
          </View>
        );
      }
      return <NativeDocReader fileUrl={fileUrl} docType={docType} />;
    }

    switch (docType) {
      case 'pdf':
        return <PdfReader fileUrl={fileUrl} />;
      case 'docx':
        return <DocxReader fileUrl={fileUrl} />;
      case 'markdown':
        return <TextReader fileUrl={fileUrl} isMarkdown={true} />;
      case 'text':
        return <TextReader fileUrl={fileUrl} isMarkdown={false} />;
      default:
        return (
          <View style={styles.centered}>
            <FileText size={64} color="#8E8E93" style={{ marginBottom: 16 }} />
            <Text style={styles.unsupportedTitle}>{shortName}</Text>
            <Text style={styles.unsupportedSub}>Preview not available for this file type.</Text>
            <Text style={styles.unsupportedSub}>Use "Export" to open externally.</Text>
          </View>
        );
    }
  };

  const badgeLabel = () => {
    switch (docType) {
      case 'pdf': return 'PDF';
      case 'docx': return 'Word';
      case 'markdown': return 'Markdown';
      case 'text': return 'Text';
      default: return 'Document';
    }
  };

  const badgeColor = () => {
    switch (docType) {
      case 'pdf': return '#FF3B30';
      case 'docx': return '#007AFF';
      case 'markdown': return '#30D158';
      case 'text': return '#8E8E93';
      default: return '#636366';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onClose}>
            <X size={20} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <View style={[styles.typeBadge, { backgroundColor: badgeColor() }]}>
              <Text style={styles.typeBadgeText}>{badgeLabel()}</Text>
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>{shortName}</Text>
          </View>

          {onExport ? (
            <TouchableOpacity style={styles.headerBtn} onPress={onExport}>
              <Download size={20} color="#FFFC00" />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerBtn} />
          )}
        </View>

        {/* Reader Area */}
        <View style={styles.readerArea}>
          {renderReader()}
        </View>
      </View>
    </Modal>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 16 : 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: '#12121C',
    gap: 8,
  },
  headerBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  typeBadge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  readerArea: {
    flex: 1,
    backgroundColor: '#0A0A0F',
  },

  // PDF
  pdfContainer: {
    flex: 1,
  },
  pdfToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#12121C',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    gap: 4,
  },
  toolbarBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarBtnDisabled: {
    opacity: 0.3,
  },
  toolbarText: {
    color: '#EBEBF5',
    fontSize: 13,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'center',
  },
  pdfScrollArea: {
    flex: 1,
    backgroundColor: '#1C1C2E',
  },
  pdfScrollContent: {
    alignItems: 'center',
    padding: 16,
  },
  pageRenderingOverlay: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
  },

  // DOCX / Text
  docxScrollArea: {
    flex: 1,
    backgroundColor: '#F9F9F9',
  },
  textScrollArea: {
    flex: 1,
    backgroundColor: '#0D0D1A',
  },
  textContent: {
    color: '#E5E5EA',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    lineHeight: 20,
  },

  // States
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    color: '#8E8E93',
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 14,
    textAlign: 'center',
  },
  unsupportedTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  unsupportedSub: {
    color: '#8E8E93',
    fontSize: 14,
    textAlign: 'center',
  },
});

export default DocumentReaderModal;
