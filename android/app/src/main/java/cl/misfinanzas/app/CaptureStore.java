package cl.misfinanzas.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Cola local de avisos capturados (notificaciones del banco o texto compartido) que aún no llegan a la app web.
 * Vive solo en este teléfono; se entrega a la web al abrir MiSaldo (en el fragmento # de la dirección, que no
 * se envía a ningún servidor) y luego se vacía.
 */
final class CaptureStore {
    private static final String PREFS = "misaldo_capturas";
    private static final String KEY = "pendientes";
    private static final int MAX = 150;

    private CaptureStore() {}

    static synchronized boolean add(Context ctx, String source, String app, String text, long postedAt, String dedupeKey) {
        try {
            SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            JSONArray list = new JSONArray(p.getString(KEY, "[]"));
            String id = sha256(source + "|" + app + "|" + dedupeKey + "|" + text).substring(0, 32);
            for (int i = 0; i < list.length(); i++) {
                if (id.equals(list.getJSONObject(i).optString("id"))) return false;
            }
            JSONObject o = new JSONObject();
            o.put("id", id);
            o.put("source", source);
            o.put("app", app);
            o.put("text", text.length() > 600 ? text.substring(0, 600) : text);
            o.put("postedAt", iso(postedAt));
            list.put(o);
            while (list.length() > MAX) list.remove(0);
            p.edit().putString(KEY, list.toString()).apply();
            return true;
        } catch (JSONException e) {
            return false;
        }
    }

    static synchronized int count(Context ctx) {
        try {
            return new JSONArray(ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]")).length();
        } catch (JSONException e) {
            return 0;
        }
    }

    /** Devuelve los avisos pendientes (JSON) y vacía la cola. */
    static synchronized JSONArray drain(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSONArray list;
        try {
            list = new JSONArray(p.getString(KEY, "[]"));
        } catch (JSONException e) {
            list = new JSONArray();
        }
        p.edit().putString(KEY, "[]").apply();
        return list;
    }

    static String base64Url(String s) {
        return Base64.encodeToString(s.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static String iso(long millis) {
        SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date(millis));
    }

    private static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder b = new StringBuilder();
            for (byte x : d) b.append(String.format("%02x", x));
            return b.toString();
        } catch (Exception e) {
            return Integer.toHexString(s.hashCode()) + "00000000000000000000000000000000";
        }
    }
}
