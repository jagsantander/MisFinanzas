package cl.misfinanzas.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import java.text.Normalizer;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Lee las notificaciones que parecen avisos de pagos (monto + palabra como «compra», «transferencia», «abono»)
 * y las deja en la cola local. Ignora apps de mensajería y todo lo que no tenga un monto. El texto no sale del
 * teléfono: MiSaldo lo interpreta al abrirse.
 */
public class BankNotificationListener extends NotificationListenerService {
    private static final String CHANNEL = "misaldo_capturas";
    private static final int SUMMARY_ID = 4242;

    /** Mensajería y redes sociales: los mensajes de personas con montos no son movimientos del banco. */
    private static final Set<String> IGNORED = new HashSet<>(Arrays.asList(
            "com.whatsapp", "com.whatsapp.w4b", "org.telegram.messenger", "org.thunderdog.challegram", "com.facebook.orca",
            "com.facebook.katana", "com.instagram.android", "org.thoughtcrime.securesms", "com.discord", "com.snapchat.android",
            "com.twitter.android", "com.zhiliaoapp.musically", "com.google.android.youtube", "com.linkedin.android"));
    private static final Pattern MONEY = Pattern.compile("(us\\$|usd|clp|\\$)\\s?\\d");
    private static final Pattern WORDS = Pattern.compile(
            "(compra|pago|pagaste|cargo|giro|transfer|abono|recibiste|deposito|devolucion|reverso|cobro|suscripcion|retiro|debito|enviaste)");

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        if (sbn == null) return;
        String pkg = sbn.getPackageName();
        if (pkg == null || pkg.equals(getPackageName()) || IGNORED.contains(pkg)) return;
        Notification n = sbn.getNotification();
        if (n == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0 || (n.flags & Notification.FLAG_ONGOING_EVENT) != 0) return;
        Bundle e = n.extras;
        if (e == null) return;
        CharSequence title = e.getCharSequence(Notification.EXTRA_TITLE);
        CharSequence big = e.getCharSequence(Notification.EXTRA_BIG_TEXT);
        CharSequence body = big != null ? big : e.getCharSequence(Notification.EXTRA_TEXT);
        String text = ((title != null ? title + ". " : "") + (body != null ? body : "")).trim();
        if (text.isEmpty()) return;
        String folded = Normalizer.normalize(text, Normalizer.Form.NFD).replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
        if (!MONEY.matcher(folded).find() || !WORDS.matcher(folded).find()) return;
        if (CaptureStore.add(this, "notification", pkg, text, sbn.getPostTime(), sbn.getKey())) showSummary();
    }

    /** Aviso discreto «N movimientos listos»: al tocarlo se abre MiSaldo y los importa. */
    private void showSummary() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (nm == null || (Build.VERSION.SDK_INT >= 24 && !nm.areNotificationsEnabled())) return;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Movimientos detectados", NotificationManager.IMPORTANCE_LOW));
        }
        int count = CaptureStore.count(this);
        Intent open = new Intent(this, MiSaldoLauncherActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(count == 1 ? "1 movimiento detectado" : count + " movimientos detectados")
                .setContentText("Toca para agregarlos a MiSaldo")
                .setContentIntent(pi)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true);
        nm.notify(SUMMARY_ID, b.build());
    }

    static void clearSummary(android.content.Context ctx) {
        NotificationManager nm = (NotificationManager) ctx.getSystemService(NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(SUMMARY_ID);
    }
}
