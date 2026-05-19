import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useRef, useMemo } from "react";
import { Loader2, Upload, FileSpreadsheet, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface ParsedRow {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  leadSource: string;
  type: string;
}


function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

export function CSVImportDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; skipped: number; skippedDetails: { row: number; reason: string }[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const reset = () => {
    setFile(null);
    setPreview([]);
    setHeaders([]);
    setTotalRows(0);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const detectedCols = useMemo(() => {
    const h = headers;
    return {
      hasPhone: h.some(c => ['phone', 'phone number', 'mobile', 'mobile phone', 'cell', 'cell phone', 'telephone', 'contact number', 'contact phone', 'home phone', 'work phone', 'primary phone'].includes(c)),
      hasEmail: h.some(c => ['email', 'email address'].includes(c)),
      hasAddress: h.some(c => ['address', 'street', 'street address'].includes(c)),
      hasCity: h.includes('city'),
      hasState: h.includes('state'),
      hasZip: h.some(c => ['zip', 'zip code', 'zipcode', 'postal code'].includes(c)),
      hasLeadSource: h.some(c => ['lead source', 'leadsource', 'source'].includes(c)),
      hasType: h.includes('type'),
    };
  }, [headers]);

  const previewColumns = useMemo(() => {
    const cols: { key: keyof ParsedRow; label: string }[] = [{ key: 'name', label: 'Name' }];
    if (detectedCols.hasPhone) cols.push({ key: 'phone', label: 'Phone' });
    if (detectedCols.hasEmail) cols.push({ key: 'email', label: 'Email' });
    if (detectedCols.hasAddress) cols.push({ key: 'address', label: 'Address' });
    if (detectedCols.hasCity) cols.push({ key: 'city', label: 'City' });
    if (detectedCols.hasState) cols.push({ key: 'state', label: 'State' });
    if (detectedCols.hasZip) cols.push({ key: 'zip', label: 'Zip' });
    if (detectedCols.hasLeadSource) cols.push({ key: 'leadSource', label: 'Source' });
    if (detectedCols.hasType) cols.push({ key: 'type', label: 'Type' });
    if (cols.length === 1) {
      cols.push({ key: 'phone', label: 'Phone' });
      cols.push({ key: 'email', label: 'Email' });
    }
    return cols;
  }, [detectedCols]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    setResult(null);
    setFile(selectedFile);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      if (lines.length < 2) {
        toast({ title: "Invalid CSV", description: "File must have a header row and at least one data row.", variant: "destructive" });
        reset();
        return;
      }

      const headerLine = lines[0].toLowerCase();
      const hdrs = parseCSVLine(headerLine);
      setHeaders(hdrs);

      const nameIdx = hdrs.findIndex(h => h === 'name' || h === 'full name' || h === 'fullname' || h === 'contact name');
      const firstNameIdx = hdrs.findIndex(h => h === 'first name' || h === 'firstname' || h === 'first');
      const lastNameIdx = hdrs.findIndex(h => h === 'last name' || h === 'lastname' || h === 'last');
      const companyIdx = hdrs.findIndex(h => h === 'company' || h === 'company name');

      if (nameIdx === -1 && firstNameIdx === -1) {
        toast({ title: "Missing 'Name' column", description: "Your CSV must have a 'Name' or 'First Name' column.", variant: "destructive" });
        reset();
        return;
      }

      const emailIdx = hdrs.findIndex(h => h === 'email' || h === 'email address');
      const phoneIdx = hdrs.findIndex(h => h === 'phone' || h === 'phone number' || h === 'mobile' || h === 'mobile phone' || h === 'cell' || h === 'cell phone' || h === 'telephone' || h === 'contact number' || h === 'contact phone' || h === 'home phone' || h === 'work phone' || h === 'primary phone');
      const addressIdx = hdrs.findIndex(h => h === 'address' || h === 'street' || h === 'street address');
      const cityIdx = hdrs.findIndex(h => h === 'city');
      const stateIdx = hdrs.findIndex(h => h === 'state');
      const zipIdx = hdrs.findIndex(h => h === 'zip' || h === 'zip code' || h === 'zipcode' || h === 'postal code');
      const leadSourceIdx = hdrs.findIndex(h => h === 'lead source' || h === 'leadsource' || h === 'source');
      const typeIdx = hdrs.findIndex(h => h === 'type');

      if (phoneIdx === -1) {
        toast({ title: "No phone column found", description: "Use 'Phone', 'Mobile Phone', or 'Cell' as the column header. Detected: " + hdrs.join(', '), variant: "destructive" });
      }

      const dataRows = lines.slice(1);
      setTotalRows(dataRows.length);

      const getName = (vals: string[]) => {
        if (nameIdx !== -1 && vals[nameIdx]?.trim()) return vals[nameIdx].trim();
        const first = firstNameIdx !== -1 ? (vals[firstNameIdx]?.trim() || '') : '';
        const last = lastNameIdx !== -1 ? (vals[lastNameIdx]?.trim() || '') : '';
        const combined = [first, last].filter(Boolean).join(' ');
        if (combined) return combined;
        if (companyIdx !== -1) return vals[companyIdx]?.trim() || '';
        return '';
      };

      const parsed: ParsedRow[] = dataRows.slice(0, 5).map(line => {
        const vals = parseCSVLine(line);
        return {
          name: getName(vals),
          email: emailIdx !== -1 ? (vals[emailIdx]?.trim() || '') : '',
          phone: phoneIdx !== -1 ? (vals[phoneIdx]?.trim() || '') : '',
          address: addressIdx !== -1 ? (vals[addressIdx]?.trim() || '') : '',
          city: cityIdx !== -1 ? (vals[cityIdx]?.trim() || '') : '',
          state: stateIdx !== -1 ? (vals[stateIdx]?.trim() || '') : '',
          zip: zipIdx !== -1 ? (vals[zipIdx]?.trim() || '') : '',
          leadSource: leadSourceIdx !== -1 ? (vals[leadSourceIdx]?.trim() || '') : '',
          type: typeIdx !== -1 ? (vals[typeIdx]?.trim() || '') : '',
        };
      });
      setPreview(parsed);
    };
    reader.readAsText(selectedFile);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/contacts/import-csv', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Import failed');
      }

      const data = await res.json();
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });

      if (data.imported > 0) {
        toast({ title: `Imported ${data.imported} contacts`, description: data.skipped > 0 ? `${data.skipped} rows were skipped.` : undefined });
      }
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-import-csv">
          <Upload className="w-4 h-4 mr-2" />
          Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {!result && (
            <>
              <Card className="border-dashed p-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <FileSpreadsheet className="w-10 h-10 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Upload a CSV file</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Required: Name (or First Name / Last Name). Optional: Email, Phone, Address, City, State, Zip, Lead Source, Type
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileSelect}
                    className="hidden"
                    data-testid="input-csv-file"
                  />
                  <Button variant="outline" onClick={() => fileInputRef.current?.click()} data-testid="button-choose-file">
                    Choose File
                  </Button>
                  {file && (
                    <p className="text-sm text-muted-foreground">{file.name}</p>
                  )}
                </div>
              </Card>

              {preview.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">Preview ({totalRows} total rows)</p>
                    <Badge variant="secondary">{totalRows} contacts</Badge>
                  </div>
                  <div className="overflow-x-auto border rounded-md">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b bg-muted/50">
                          {previewColumns.map(col => (
                            <th key={col.key} className="text-left p-2 font-medium">{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} className="border-b last:border-0">
                            {previewColumns.map(col => (
                              <td key={col.key} className="p-2 truncate max-w-[140px]">{row[col.key] || '-'}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {totalRows > 5 && (
                    <p className="text-xs text-muted-foreground text-center">Showing first 5 of {totalRows} rows</p>
                  )}
                  <Button
                    onClick={handleImport}
                    disabled={importing}
                    className="w-full"
                    data-testid="button-start-import"
                  >
                    {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Import {totalRows} Contacts
                  </Button>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-muted/50 rounded-md">
                <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                <div>
                  <p className="font-medium">{result.imported} contacts imported successfully</p>
                  {result.skipped > 0 && (
                    <p className="text-sm text-muted-foreground">{result.skipped} rows skipped</p>
                  )}
                </div>
              </div>

              {result.skippedDetails && result.skippedDetails.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <p className="text-sm font-medium">Skipped rows</p>
                  </div>
                  <div className="max-h-32 overflow-y-auto border rounded-md">
                    {result.skippedDetails.map((s, i) => (
                      <div key={i} className="text-xs p-2 border-b last:border-0 flex justify-between gap-2">
                        <span className="text-muted-foreground">Row {s.row}</span>
                        <span>{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={() => { reset(); setOpen(false); }} className="w-full" data-testid="button-close-import">
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
