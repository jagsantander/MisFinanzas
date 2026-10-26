package cl.misfinanzas.app;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** «Compartir → MiSaldo» desde Gmail u otra app: guarda el texto en la cola y abre MiSaldo para importarlo. */
public class ShareReceiverActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Intent in = getIntent();
        if (in != null && Intent.ACTION_SEND.equals(in.getAction())) {
            CharSequence subject = in.getCharSequenceExtra(Intent.EXTRA_SUBJECT);
            CharSequence text = in.getCharSequenceExtra(Intent.EXTRA_TEXT);
            String all = ((subject != null ? subject + ". " : "") + (text != null ? text : "")).trim();
            if (!all.isEmpty()) {
                String from = getReferrer() != null ? getReferrer().getHost() : "";
                CaptureStore.add(this, "shared", from == null ? "" : from, all, System.currentTimeMillis(), String.valueOf(System.currentTimeMillis()));
            }
        }
        startActivity(new Intent(this, MiSaldoLauncherActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP));
        finish();
    }
}
