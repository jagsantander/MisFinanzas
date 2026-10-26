package cl.misfinanzas.app;

import android.content.ComponentName;
import android.net.Uri;
import android.provider.Settings;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Abre MiSaldo (Trusted Web Activity) entregándole los avisos capturados en el fragmento de la dirección
 * (#ms=…), que el navegador nunca envía al servidor. También informa si el permiso de notificaciones está activo.
 */
public class MiSaldoLauncherActivity extends LauncherActivity {
    @Override
    protected Uri getLaunchingUrl() {
        Uri base = super.getLaunchingUrl();
        try {
            JSONObject payload = new JSONObject();
            payload.put("v", 1);
            payload.put("listener", notificationAccessGranted());
            JSONArray items = CaptureStore.drain(this);
            payload.put("items", items);
            BankNotificationListener.clearSummary(this);
            return base.buildUpon().encodedFragment("ms=" + CaptureStore.base64Url(payload.toString())).build();
        } catch (JSONException e) {
            return base;
        }
    }

    private boolean notificationAccessGranted() {
        String flat = Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        if (flat == null) return false;
        String me = new ComponentName(this, BankNotificationListener.class).flattenToString();
        for (String c : flat.split(":")) if (me.equals(c)) return true;
        return false;
    }
}
