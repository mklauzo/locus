from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('hotels', '0005_aiassistant_ollama_url'),
    ]

    operations = [
        migrations.AddField(model_name='hotel', name='smtp_host', field=models.CharField(blank=True, max_length=255, default=''), preserve_default=False),
        migrations.AddField(model_name='hotel', name='smtp_port', field=models.IntegerField(default=587)),
        migrations.AddField(model_name='hotel', name='smtp_ssl', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='hotel', name='smtp_login', field=models.CharField(blank=True, max_length=255, default=''), preserve_default=False),
        migrations.AddField(model_name='hotel', name='smtp_password', field=models.CharField(blank=True, max_length=255, default=''), preserve_default=False),
    ]
